import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import { FileSearch, Clock, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RelatorioMensal, Usuario } from '@/lib/database.types'
import { format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

const STATUS_COLOR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-600',
  enviado: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
  nao_enviado: 'bg-red-50 text-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  atrasado: 'Atrasado',
  nao_enviado: 'Não enviado',
}

function gerarMeses(qtd: number) {
  return Array.from({ length: qtd }, (_, i) => format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM-dd'))
}

function slug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function exportarRelatorioMembroPdf(usuario: Usuario, relatorio: RelatorioMensal, mesSelecionado: string) {
  const doc = new jsPDF()
  const margemEsquerda = 14
  const larguraUtil = 182
  const alturaPagina = doc.internal.pageSize.getHeight()
  const margemInferior = 20
  let y = 20

  function novaLinha(altura: number) {
    if (y + altura > alturaPagina - margemInferior) {
      doc.addPage()
      y = 20
    }
  }

  function secao(titulo: string, corpo: string) {
    novaLinha(8)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 80)
    doc.text(titulo.toUpperCase(), margemEsquerda, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(11)
    const linhas = doc.splitTextToSize(corpo || '—', larguraUtil)
    for (const linha of linhas) {
      novaLinha(6)
      doc.text(linha, margemEsquerda, y)
      y += 6
    }
    y += 3
  }

  // Cabeçalho
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('CCAD — Comissão Central de Avaliação de Documentos', margemEsquerda, y)
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('CDTIV', margemEsquerda, y)
  y += 4
  doc.setDrawColor(200, 200, 200)
  doc.line(margemEsquerda, y, margemEsquerda + larguraUtil, y)
  y += 10

  // Título
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('Relatório Mensal de Atividades', margemEsquerda, y)
  y += 9

  // Dados do membro
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(usuario.nome, margemEsquerda, y)
  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(usuario.email, margemEsquerda, y)
  y += 5.5
  doc.text(`Mês de referência: ${format(new Date(mesSelecionado), 'MMMM yyyy', { locale: ptBR })}`, margemEsquerda, y)
  y += 5.5
  const statusTexto = STATUS_LABEL[relatorio.status] ?? relatorio.status
  const enviadoTexto = relatorio.enviado_em
    ? ` — enviado em ${format(new Date(relatorio.enviado_em), 'dd/MM/yyyy HH:mm')}`
    : ''
  doc.text(`Status: ${statusTexto}${enviadoTexto}`, margemEsquerda, y)
  y += 9

  secao('Atividades realizadas', relatorio.atividades_realizadas)
  if (relatorio.dificuldades) {
    secao('Dificuldades encontradas', relatorio.dificuldades)
  }

  novaLinha(8)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(`Horas dedicadas no mês: ${relatorio.horas_dedicadas ?? 0}h`, margemEsquerda, y)

  // Rodapé em todas as páginas
  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} pelo Portal da CCAD — página ${i} de ${totalPaginas}`,
      margemEsquerda,
      alturaPagina - 10,
    )
  }

  const nomeArquivo = `relatorio-${slug(usuario.nome)}-${mesSelecionado}.pdf`
  doc.save(nomeArquivo)
}

export function RelatoriosEquipePage() {
  const meses = useMemo(() => gerarMeses(12), [])
  const [mesSelecionado, setMesSelecionado] = useState(meses[0])

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-ativos'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('*').eq('status', 'ativo').order('nome')
      return (data ?? []) as Usuario[]
    },
  })

  const { data: relatorios, isLoading } = useQuery({
    queryKey: ['relatorios-equipe', mesSelecionado],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('*, usuario:usuario_id(id,nome,email,papel), pilar:pilar_id(id,nome)')
        .eq('mes_referencia', mesSelecionado)
      return (data ?? []) as RelatorioMensal[]
    },
    enabled: !!mesSelecionado,
  })

  const linhas = (usuarios ?? []).map(u => {
    const relatorio = (relatorios ?? []).find(r => r.usuario_id === u.id)
    return { usuario: u, relatorio }
  })

  const enviados = linhas.filter(l => l.relatorio?.status === 'enviado').length
  const total = linhas.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios da Equipe</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Acompanhe os relatórios mensais enviados por cada membro da Comissão.
          </p>
        </div>
        <select
          className="input w-56"
          value={mesSelecionado}
          onChange={e => setMesSelecionado(e.target.value)}
        >
          {meses.map(m => (
            <option key={m} value={m}>
              {format(new Date(m), 'MMMM yyyy', { locale: ptBR })}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <FileSearch size={18} className="text-teal-600 shrink-0" />
        <p className="text-sm text-gray-700">
          <strong>{enviados}</strong> de <strong>{total}</strong> membro(s) enviaram o relatório de{' '}
          {format(new Date(mesSelecionado), 'MMMM yyyy', { locale: ptBR })}.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-center py-10 text-gray-400">Nenhum membro ativo cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {linhas.map(({ usuario, relatorio }) => {
            const status = relatorio?.status ?? 'nao_enviado'
            return (
              <div key={usuario.id} className="card p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{usuario.nome}</p>
                    <p className="text-xs text-gray-400">{usuario.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {relatorio?.enviado_em && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={12} /> {format(new Date(relatorio.enviado_em), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[status])}>
                      {STATUS_LABEL[status]}
                    </span>
                    {relatorio && (
                      <button
                        type="button"
                        className="btn-secondary text-xs py-1.5"
                        onClick={() => exportarRelatorioMembroPdf(usuario, relatorio, mesSelecionado)}
                      >
                        <Download size={14} /> Baixar PDF
                      </button>
                    )}
                  </div>
                </div>

                {relatorio ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Atividades realizadas
                      </p>
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {relatorio.atividades_realizadas || '—'}
                      </p>
                    </div>
                    {relatorio.dificuldades && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Dificuldades encontradas
                        </p>
                        <p className="text-gray-700 whitespace-pre-wrap">{relatorio.dificuldades}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      Horas dedicadas no mês: {relatorio.horas_dedicadas ?? 0}h
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-400">
                    Este membro ainda não enviou o relatório deste mês.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
