import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import { Search, Archive, AlertTriangle, Clock, X, FileSignature } from 'lucide-react'
import { format, addDays, isPast } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Processo, Caixa, Avaliacao, Emprestimo } from '@/lib/database.types'

const PRAZO_PADRAO_DIAS = 15

type ProcessoBusca = Processo & {
  caixa: Pick<Caixa, 'numero' | 'setor'> | null
  avaliacoes: Pick<Avaliacao, 'decisao' | 'status' | 'confirmado_em'>[] | null
  emprestimos: Pick<Emprestimo, 'id' | 'prazo_previsto' | 'devolvido_em'>[] | null
}

function situacaoEliminacao(p: ProcessoBusca) {
  const confirmada = (p.avaliacoes ?? []).find(
    a => a.status === 'confirmada' && a.decisao?.toLowerCase().includes('elimin'),
  )
  return confirmada?.confirmado_em ?? null
}

function emprestimoAtivo(p: ProcessoBusca) {
  return (p.emprestimos ?? []).find(e => !e.devolvido_em) ?? null
}

function gerarDeclaracaoDesarquivamentoPdf(dados: {
  processo: ProcessoBusca
  solicitanteNome: string
  solicitanteMatricula: string
  protocolistaNome: string
  prazoPrevisto: Date
}) {
  const { processo, solicitanteNome, solicitanteMatricula, protocolistaNome, prazoPrevisto } = dados
  const doc = new jsPDF()
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const margemEsquerda = 20
  const margemDireita = 20
  const larguraUtil = larguraPagina - margemEsquerda - margemDireita
  const margemInferior = 22
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

  function linhaDado(rotulo: string, valor: string) {
    garantirEspaco(6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(90, 90, 90)
    doc.text(rotulo, margemEsquerda, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.text(valor, margemEsquerda + 48, y)
    y += 6
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

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text('DECLARAÇÃO DE DESARQUIVAMENTO', larguraPagina / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Protocolo Geral — CCAD / CDTIV', larguraPagina / 2, y, { align: 'center' })
  y += 14

  linhaDado('Processo/documento:', processo.numero_documento || '—')
  linhaDado('Assunto:', processo.assunto_processo || '—')
  linhaDado('Caixa de origem:', processo.caixa?.numero ?? '—')
  linhaDado('Interessado:', processo.interessado || '—')
  y += 6

  paragrafo(
    `Eu, ${solicitanteNome}, portador(a) da matrícula nº ${solicitanteMatricula}, declaro ter retirado nesta data, junto ao Protocolo Geral da CCAD/CDTIV, o processo/documento acima identificado, sob a responsabilidade de ${protocolistaNome}.`,
    { espacoDepois: 6 },
  )
  paragrafo(
    `Assumo o compromisso de devolver o referido processo/documento até o dia ${format(prazoPrevisto, 'dd/MM/yyyy')}, ou de solicitar, junto ao Protocolo, a prorrogação desse prazo, caso seja necessário permanecer com o processo/documento por mais tempo.`,
    { espacoDepois: 10 },
  )

  garantirEspaco(10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(`Vitória, ${format(agora, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}.`, margemEsquerda, y)
  y += 26

  // Linha de assinatura física do solicitante
  garantirEspaco(20)
  const linhaLargura = 90
  const linhaX = larguraPagina / 2 - linhaLargura / 2
  doc.setDrawColor(120, 120, 120)
  doc.line(linhaX, y, linhaX + linhaLargura, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text(solicitanteNome, larguraPagina / 2, y, { align: 'center' })
  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(120, 120, 120)
  doc.text(`Matrícula nº ${solicitanteMatricula} — assinatura do solicitante`, larguraPagina / 2, y, { align: 'center' })

  // Rodapé
  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Gerado pelo Portal da CCAD em ${agora.toLocaleString('pt-BR')} — página ${i} de ${totalPaginas}`,
      margemEsquerda,
      alturaPagina - 12,
    )
  }

  doc.save(`declaracao-desarquivamento-${processo.numero_documento || processo.id}.pdf`)
}

function ModalSolicitarEmprestimo({
  processo,
  protocolistaNome,
  onClose,
  onConfirmado,
}: {
  processo: ProcessoBusca
  protocolistaNome: string
  onClose: () => void
  onConfirmado: () => void
}) {
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [prazo, setPrazo] = useState(format(addDays(new Date(), PRAZO_PADRAO_DIAS), 'yyyy-MM-dd'))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const formValido = nome.trim().length >= 3 && matricula.trim().length > 0 && prazo

  async function handleConfirmar() {
    if (!formValido) return
    setSalvando(true)
    setErro('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada, faça login novamente.')

      const { error: erroInsert } = await supabase.from('emprestimos').insert({
        processo_id: processo.id,
        solicitante_nome: nome.trim(),
        solicitante_matricula: matricula.trim(),
        protocolista_id: user.id,
        prazo_previsto: prazo,
      })
      if (erroInsert) throw erroInsert

      const { error: erroUpdate } = await supabase
        .from('processos')
        .update({ status_emprestimo: 'emprestado' })
        .eq('id', processo.id)
      if (erroUpdate) throw erroUpdate

      gerarDeclaracaoDesarquivamentoPdf({
        processo,
        solicitanteNome: nome.trim(),
        solicitanteMatricula: matricula.trim(),
        protocolistaNome,
        prazoPrevisto: new Date(`${prazo}T00:00:00`),
      })

      onConfirmado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar o desarquivamento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FileSignature size={18} className="text-navy-600" /> Solicitar Empréstimo
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Processo {processo.numero_documento} — Caixa {processo.caixa?.numero ?? '—'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="label">Nome completo do solicitante</label>
          <input className="input" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Matrícula</label>
          <input className="input" value={matricula} onChange={e => setMatricula(e.target.value)} />
        </div>
        <div>
          <label className="label">Prazo de devolução</label>
          <input type="date" className="input" value={prazo} onChange={e => setPrazo(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            Sugerido automaticamente ({PRAZO_PADRAO_DIAS} dias corridos) — pode ajustar se necessário.
          </p>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary text-sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={!formValido || salvando}
            onClick={handleConfirmar}
          >
            {salvando ? 'Registrando…' : 'Confirmar e Gerar Declaração'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BuscaProcessosPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [termo, setTermo] = useState('')
  const [ano, setAno] = useState('')
  const [interessado, setInteressado] = useState('')
  const [setor, setSetor] = useState('')
  const [processoParaEmprestimo, setProcessoParaEmprestimo] = useState<ProcessoBusca | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  const temFiltro = termo.trim().length >= 2 || ano.trim().length > 0 || interessado.length > 0 || setor.length > 0

  const { data: setores } = useQuery({
    queryKey: ['setores-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('caixas').select('setor').not('setor', 'is', null)
      if (error) throw error
      const unicos = Array.from(new Set((data ?? []).map(c => c.setor).filter((s): s is string => !!s)))
      return unicos.sort((a, b) => a.localeCompare(b))
    },
    staleTime: 5 * 60 * 1000,
  })

  const queryKey = ['busca-processos', termo, ano, interessado, setor]

  const { data: resultados, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('processos')
        .select(
          '*, caixa:caixa_id!inner(numero,setor), avaliacoes(decisao,status,confirmado_em), emprestimos(id,prazo_previsto,devolvido_em)',
        )

      if (termo.trim().length >= 2) {
        const t = termo.trim()
        query = query.or(
          `numero_documento.ilike.%${t}%,assunto_processo.ilike.%${t}%,interessado.ilike.%${t}%,ano_producao_complemento.ilike.%${t}%`,
        )
      }
      if (ano.trim()) {
        query = query.eq('ano_producao', Number(ano.trim()))
      }
      if (interessado) {
        query = query.eq('interessado', interessado)
      }
      if (setor) {
        query = query.eq('caixa.setor', setor)
      }

      const { data, error } = await query
        .order('ano_producao', { ascending: false })
        .order('numero_documento', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data ?? []) as ProcessoBusca[]
    },
    enabled: temFiltro,
  })

  function handleEmprestimoConfirmado() {
    setProcessoParaEmprestimo(null)
    setMensagemSucesso('Declaração de Desarquivamento baixada. Peça a assinatura do solicitante e guarde a via física no Protocolo (o anexo digitalizado será feito numa próxima etapa).')
    queryClient.invalidateQueries({ queryKey })
    window.setTimeout(() => setMensagemSucesso(''), 8000)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buscar Processo</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Encontre um processo já arquivado mesmo sem saber o número — por assunto, ano de produção, interessado ou
          setor. O resultado sempre mostra em qual caixa do Arquivo Geral ele está guardado.
        </p>
      </div>

      {mensagemSucesso && (
        <div className="card p-4 bg-teal-50 border border-teal-200 text-sm text-teal-800">
          {mensagemSucesso}
        </div>
      )}

      <div className="card p-5 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Digite um assunto, número do processo, interessado…  ex.: “energia”, “7284/2014”, “projeto curva da jurema”"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input w-40"
            type="number"
            placeholder="Ano de produção"
            value={ano}
            onChange={e => setAno(e.target.value)}
          />
          <select className="input w-48" value={interessado} onChange={e => setInteressado(e.target.value)}>
            <option value="">Interessado — todos</option>
            <option value="CDTIV">CDTIV</option>
            <option value="PMV">PMV</option>
          </select>
          <select className="input w-48" value={setor} onChange={e => setSetor(e.target.value)}>
            <option value="">Setor de origem — todos</option>
            {(setores ?? []).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400">
          A busca considera assunto, número do documento, interessado e o campo de ano ao mesmo tempo — não precisa saber onde a informação está.
        </p>
      </div>

      {!temFiltro ? (
        <div className="card p-10 text-center">
          <Search size={36} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Digite ao menos 2 letras ou escolha um filtro para começar a busca.</p>
        </div>
      ) : isLoading || isFetching ? (
        <p className="text-center py-10 text-gray-400">Buscando…</p>
      ) : (resultados ?? []).length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-500 text-sm">Nenhum processo encontrado com esses termos. Tente um assunto mais geral ou remova algum filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            {resultados!.length} processo(s) encontrado(s){resultados!.length === 50 ? ' — mostrando os 50 primeiros, refine a busca para ver mais precisão' : ''}.
          </p>
          {resultados!.map(p => {
            const eliminadoEm = situacaoEliminacao(p)
            const emprestimo = emprestimoAtivo(p)
            const atrasado = emprestimo ? isPast(new Date(`${emprestimo.prazo_previsto}T23:59:59`)) : false
            const podeEmprestar = !eliminadoEm && p.status_emprestimo !== 'emprestado'
            return (
              <div key={p.id} className="card p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-900">{p.numero_documento}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{p.interessado}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {p.ano_producao}{p.ano_producao_complemento ? ` (${p.ano_producao_complemento})` : ''}
                    </span>
                    {eliminadoEm && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium inline-flex items-center gap-1">
                        <AlertTriangle size={11} /> Eliminado em {format(new Date(eliminadoEm), 'dd/MM/yyyy')}
                      </span>
                    )}
                    {emprestimo && (
                      <span
                        className={
                          atrasado
                            ? 'text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium inline-flex items-center gap-1'
                            : 'text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium inline-flex items-center gap-1'
                        }
                      >
                        <Clock size={11} />
                        {atrasado ? 'Atrasado — ' : 'Emprestado — devolução até '}
                        {format(new Date(`${emprestimo.prazo_previsto}T00:00:00`), 'dd/MM/yyyy')}
                      </span>
                    )}
                  </div>
                  {p.assunto_processo && (
                    <p className="text-sm text-gray-600 line-clamp-2">{p.assunto_processo}</p>
                  )}
                </div>

                <div className="shrink-0 text-center bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold flex items-center gap-1 justify-center">
                    <Archive size={11} /> Caixa
                  </p>
                  <p className="text-base font-bold text-amber-800">{p.caixa?.numero ?? '—'}</p>
                  {p.caixa?.setor && (
                    <p className="text-[10px] text-amber-600 mt-0.5">{p.caixa.setor}</p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-stretch gap-1">
                  <button
                    className={podeEmprestar ? 'btn-secondary text-xs py-1.5 px-3' : 'btn-secondary text-xs py-1.5 px-3 opacity-60 cursor-not-allowed'}
                    disabled={!podeEmprestar}
                    title={
                      eliminadoEm
                        ? 'Processo já eliminado'
                        : p.status_emprestimo === 'emprestado'
                          ? 'Processo já está emprestado'
                          : 'Registrar desarquivamento'
                    }
                    onClick={() => podeEmprestar && setProcessoParaEmprestimo(p)}
                  >
                    <Clock size={12} /> Solicitar Empréstimo
                  </button>
                  {!podeEmprestar && (
                    <p className="text-[10px] text-gray-400 text-center">
                      {eliminadoEm ? 'eliminado' : 'indisponível'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {processoParaEmprestimo && (
        <ModalSolicitarEmprestimo
          processo={processoParaEmprestimo}
          protocolistaNome={profile?.nome ?? '—'}
          onClose={() => setProcessoParaEmprestimo(null)}
          onConfirmado={handleEmprestimoConfirmado}
        />
      )}
    </div>
  )
}
