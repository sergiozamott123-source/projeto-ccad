import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import { FileSearch, Clock, Download, FileSignature, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function competenciaTexto(mesSelecionado: string) {
  const d = new Date(mesSelecionado)
  return `${capitalizar(format(d, 'MMMM', { locale: ptBR }))}/${format(d, 'yyyy')}`
}

function gerarCodigoDocumento() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let codigo = ''
  for (let i = 0; i < 8; i++) codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`
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

function exportarTermoEnvioPdf(nomeCoordenador: string, mesSelecionado: string, referencia: string, textoAtividades: string) {
  const doc = new jsPDF()
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const margemEsquerda = 20
  const margemDireita = 20
  const larguraUtil = larguraPagina - margemEsquerda - margemDireita
  const margemInferior = 22
  const competencia = referencia.trim() || competenciaTexto(mesSelecionado)
  const codigoDocumento = gerarCodigoDocumento()
  const agora = new Date()

  let y = 0

  function garantirEspaco(altura: number) {
    if (y + altura > alturaPagina - margemInferior) {
      doc.addPage()
      y = 20
    }
  }

  function paragrafo(texto: string, opts: { negrito?: boolean; tamanho?: number; espacoDepois?: number } = {}) {
    doc.setFont('helvetica', opts.negrito ? 'bold' : 'normal')
    doc.setFontSize(opts.tamanho ?? 11)
    doc.setTextColor(30, 30, 30)
    const linhas = doc.splitTextToSize(texto, larguraUtil)
    for (const linha of linhas) {
      garantirEspaco(6.2)
      doc.text(linha, margemEsquerda, y)
      y += 6.2
    }
    y += opts.espacoDepois ?? 4
  }

  // Cabeçalho com a identidade visual do Portal
  doc.setFillColor(32, 40, 59)
  doc.rect(0, 0, larguraPagina, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('CCAD', margemEsquerda, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(190, 219, 220)
  doc.text('Comissão Central de Avaliação de Documentos — CDTIV', margemEsquerda, 20)
  doc.setFillColor(14, 124, 134)
  doc.rect(0, 24, larguraPagina, 2, 'F')
  y = 38

  // Título do documento
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text('TERMO DE ENVIO DE RELATÓRIOS MENSAIS', larguraPagina / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('CCAD / CDTIV', larguraPagina / 2, y, { align: 'center' })
  y += 10

  // Selo de referência (competência)
  const refTexto = `Referência: ${competencia}`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const refLargura = doc.getTextWidth(refTexto) + 10
  const refX = larguraPagina / 2 - refLargura / 2
  doc.setFillColor(14, 124, 134)
  doc.roundedRect(refX, y - 5.5, refLargura, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(refTexto, larguraPagina / 2, y, { align: 'center' })
  y += 14

  // Saudação
  paragrafo('Ao NRH', { espacoDepois: 5 })

  // Corpo — texto do coordenador, dividido em parágrafos por linha em branco
  const paragrafos = textoAtividades.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  for (const p of paragrafos) {
    paragrafo(p, { espacoDepois: 4 })
  }

  // Fechamento automático
  paragrafo(
    `Em anexo, apresento os relatórios mensais (competência ${competencia}) dos membros da CCAD.`,
    { espacoDepois: 10 },
  )

  // Data por extenso (gerada automaticamente)
  garantirEspaco(10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(`Vitória, ${format(agora, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}.`, margemEsquerda, y)
  y += 22

  // Assinatura eletrônica (gerada automaticamente)
  garantirEspaco(32)
  const linhaLargura = 80
  const linhaX = larguraPagina / 2 - linhaLargura / 2
  doc.setDrawColor(120, 120, 120)
  doc.line(linhaX, y, linhaX + linhaLargura, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text(nomeCoordenador, larguraPagina / 2, y, { align: 'center' })
  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  doc.text('Coordenador da CCAD/CDTIV', larguraPagina / 2, y, { align: 'center' })
  y += 7
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(130, 130, 130)
  const assinaturaTexto = `Documento assinado eletronicamente por ${nomeCoordenador} em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — Portal da CCAD. Código do documento: ${codigoDocumento}`
  const linhasAssinatura = doc.splitTextToSize(assinaturaTexto, larguraUtil - 30)
  for (const linha of linhasAssinatura) {
    garantirEspaco(4.2)
    doc.text(linha, larguraPagina / 2, y, { align: 'center' })
    y += 4.2
  }

  // Rodapé em todas as páginas
  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Documento gerado pelo Portal da CCAD — código ${codigoDocumento} — página ${i} de ${totalPaginas}`,
      margemEsquerda,
      alturaPagina - 12,
    )
  }

  doc.save(`termo-envio-relatorio-${mesSelecionado}.pdf`)
}

export function RelatoriosEquipePage() {
  const { profile } = useAuth()
  const meses = useMemo(() => gerarMeses(12), [])
  const [mesSelecionado, setMesSelecionado] = useState(meses[0])
  const [referenciaTermo, setReferenciaTermo] = useState(competenciaTexto(meses[0]))
  const [textoTermo, setTextoTermo] = useState('')
  const [termoGerado, setTermoGerado] = useState(false)

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

  function handleGerarTermo() {
    if (!profile || !textoTermo.trim()) return
    exportarTermoEnvioPdf(profile.nome, mesSelecionado, referenciaTermo, textoTermo.trim())
    setTermoGerado(true)
  }

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
          onChange={e => {
            setMesSelecionado(e.target.value)
            setReferenciaTermo(competenciaTexto(e.target.value))
            setTermoGerado(false)
          }}
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

      {/* Termo de Envio de Relatório Mensal (NRH) */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <FileSignature size={20} className="text-navy-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">Termo de Envio de Relatório Mensal</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Documento oficial para encaminhar ao NRH junto com os relatórios da equipe.
            </p>
          </div>
        </div>

        <div>
          <label className="label">Referência</label>
          <input
            type="text"
            className="input sm:w-64"
            value={referenciaTermo}
            onChange={e => {
              setReferenciaTermo(e.target.value)
              setTermoGerado(false)
            }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Sugerida automaticamente a partir do mês selecionado acima — ajuste aqui se o termo cobrir mais de um mês
            (ex.: "Junho-Julho/2026").
          </p>
        </div>

        <div>
          <label className="label">Texto das atividades do mês</label>
          <textarea
            className="input min-h-[140px] resize-y"
            placeholder={
              'Descreva as atividades da CCAD no mês: reuniões realizadas, decisões, encaminhamentos junto à Diretoria etc.\n\nSepare os parágrafos com uma linha em branco.'
            }
            value={textoTermo}
            onChange={e => {
              setTextoTermo(e.target.value)
              setTermoGerado(false)
            }}
          />
          <p className="text-xs text-gray-400 mt-1">
            Data, local, saudação e assinatura eletrônica são preenchidos automaticamente pelo sistema.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={!textoTermo.trim()}
            onClick={handleGerarTermo}
          >
            <FileSignature size={16} /> Gerar PDF do Termo
          </button>
          {termoGerado && (
            <span className="text-sm text-green-700 flex items-center gap-1">
              <CheckCircle2 size={16} /> Termo gerado e baixado.
            </span>
          )}
        </div>
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
