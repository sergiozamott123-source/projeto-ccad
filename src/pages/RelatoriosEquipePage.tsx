import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { carregarModeloDocumento, setorCcad, dataHoraPorExtenso } from '@/lib/pdfCcad'
import { FileSearch, Clock, Download, FileSignature, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { RelatorioMensal, Usuario } from '@/lib/database.types'
import { format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RelatorioStatusBadge } from '@/components/badges/DecisaoBadges'

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

async function exportarRelatorioMembroPdf(usuario: Usuario, relatorio: RelatorioMensal, mesSelecionado: string) {
  const { JsPDF, M, DV } = await carregarModeloDocumento()
  const mesTexto = format(new Date(mesSelecionado), 'MMMM yyyy', { locale: ptBR })
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Coordenação'), tituloPdf: 'Relatório Mensal de Atividades' },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: `Relatório mensal · ${mesTexto}`, texto: 'Relatório Mensal de Atividades' })

  const statusTexto = STATUS_LABEL[relatorio.status] ?? relatorio.status
  const enviadoTexto = relatorio.enviado_em
    ? ` — enviado em ${format(new Date(relatorio.enviado_em), 'dd/MM/yyyy HH:mm')}`
    : ''
  y = M.ficha(
    doc,
    [
      ['Membro', usuario.nome],
      ['E-mail', usuario.email],
      ['Mês de referência', mesTexto],
      ['Status', `${statusTexto}${enviadoTexto}`],
    ],
    y,
  )

  function secao(titulo: string, corpo: string) {
    y = M.paragrafo(doc, titulo.toUpperCase(), y, {
      tamanho: 8.5,
      alinhamento: 'left',
      estilo: 'textoSemi',
      cor: DV.base.textoSecundario,
    })
    y = M.paragrafo(doc, corpo || '—', y - 2)
  }

  secao('Atividades realizadas', relatorio.atividades_realizadas)
  if (relatorio.dificuldades) {
    secao('Dificuldades encontradas', relatorio.dificuldades)
  }
  if (relatorio.processos_avaliados_qtd > 0) {
    secao(
      'Processos avaliados no mês',
      `${relatorio.processos_avaliados_qtd} processo(s) — nº ${relatorio.processos_avaliados_numeros.join(', ')}`,
    )
  }
  if (relatorio.requisicoes_emitidas_qtd > 0) {
    secao(
      'Requisições emitidas no mês',
      `${relatorio.requisicoes_emitidas_qtd} requisição(ões) — caixas ${relatorio.requisicoes_emitidas_caixas.join(', ')}`,
    )
  }
  M.paragrafo(doc, `Horas dedicadas no mês: ${relatorio.horas_dedicadas ?? 0}h`, y, {
    alinhamento: 'left',
    estilo: 'textoNegrito',
  })

  M.finalizar(doc)
  const nomeArquivo = `relatorio-${slug(usuario.nome)}-${mesSelecionado}.pdf`
  doc.save(nomeArquivo)
}

async function exportarTermoEnvioPdf(nomeCoordenador: string, mesSelecionado: string, referencia: string, textoAtividades: string) {
  const { JsPDF, M } = await carregarModeloDocumento()
  const competencia = referencia.trim() || competenciaTexto(mesSelecionado)
  const codigoDocumento = gerarCodigoDocumento()
  const agora = new Date()
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Coordenação'), tituloPdf: 'Termo de Envio de Relatórios Mensais' },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: `Referência: ${competencia}`, texto: 'Termo de Envio de Relatórios Mensais' })

  y = M.paragrafo(doc, 'Ao NRH', y, { alinhamento: 'left' })

  // Corpo — texto do coordenador, dividido em parágrafos por linha em branco
  const paragrafos = textoAtividades.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  for (const p of paragrafos) {
    y = M.paragrafo(doc, p, y)
  }

  // Fechamento automático
  y = M.paragrafo(doc, `Em anexo, apresento os relatórios mensais (competência ${competencia}) dos membros da CCAD.`, y)

  y = M.localData(doc, y + 4, agora)
  M.assinatura(doc, {
    nome: nomeCoordenador,
    cargo: 'Coordenador da CCAD/CDTIV',
    y: y + 18,
    eletronica: { data: dataHoraPorExtenso(agora), codigo: codigoDocumento },
  })

  M.finalizar(doc, { codigo: codigoDocumento, geradoEm: agora })
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

  async function handleGerarTermo() {
    if (!profile || !textoTermo.trim()) return
    await exportarTermoEnvioPdf(profile.nome, mesSelecionado, referenciaTermo, textoTermo.trim())
    setTermoGerado(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Relatórios da Equipe</h2>
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
          <p className="text-xs text-gray-500 mt-1">
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
          <p className="text-xs text-gray-500 mt-1">
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
        <p className="text-center py-10 text-gray-500">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-center py-10 text-gray-500">Nenhum membro ativo cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {linhas.map(({ usuario, relatorio }) => {
            const status = relatorio?.status ?? 'nao_enviado'
            return (
              <div key={usuario.id} className="card p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{usuario.nome}</p>
                    <p className="text-xs text-gray-500">{usuario.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {relatorio?.enviado_em && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={12} /> {format(new Date(relatorio.enviado_em), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    <RelatorioStatusBadge status={status} />
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
                    {(relatorio.processos_avaliados_qtd > 0 || relatorio.requisicoes_emitidas_qtd > 0) && (
                      <div className="rounded-lg bg-teal-50/60 border border-teal-100 p-3 space-y-1.5">
                        {relatorio.processos_avaliados_qtd > 0 && (
                          <p className="text-xs text-gray-700">
                            <strong>{relatorio.processos_avaliados_qtd}</strong> processo(s) avaliado(s) — nº{' '}
                            {relatorio.processos_avaliados_numeros.join(', ')}
                          </p>
                        )}
                        {relatorio.requisicoes_emitidas_qtd > 0 && (
                          <p className="text-xs text-gray-700">
                            <strong>{relatorio.requisicoes_emitidas_qtd}</strong> requisição(ões) emitida(s) — caixas{' '}
                            {relatorio.requisicoes_emitidas_caixas.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      Horas dedicadas no mês: {relatorio.horas_dedicadas ?? 0}h
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
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
