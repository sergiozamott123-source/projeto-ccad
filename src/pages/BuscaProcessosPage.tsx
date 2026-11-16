import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { carregarModeloDocumento, setorCcad } from '@/lib/pdfCcad'
import { Search, Archive, AlertTriangle, Clock, X, FileSignature, Undo2, CheckCircle2, CalendarClock, MapPin } from 'lucide-react'
import { DataIcon } from '@/components/badges/DecisaoBadges'
import { format, addDays, isPast } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Processo, Caixa, Avaliacao, Emprestimo } from '@/lib/database.types'

const PRAZO_PADRAO_DIAS = 15

type ProcessoBusca = Processo & {
  caixa: Pick<Caixa, 'numero' | 'setor'> | null
  avaliacoes: Pick<Avaliacao, 'decisao' | 'status' | 'confirmado_em'>[] | null
  emprestimos: Pick<
    Emprestimo,
    'id' | 'solicitante_nome' | 'solicitante_matricula' | 'desarquivado_em' | 'prazo_previsto' | 'devolvido_em'
  >[] | null
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

async function gerarDeclaracaoDesarquivamentoPdf(dados: {
  processo: ProcessoBusca
  solicitanteNome: string
  solicitanteMatricula: string
  protocolistaNome: string
  prazoPrevisto: Date
}) {
  const { processo, solicitanteNome, solicitanteMatricula, protocolistaNome, prazoPrevisto } = dados
  const { JsPDF, M } = await carregarModeloDocumento()
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Protocolo Geral · Arquivo'), tituloPdf: 'Declaração de Desarquivamento' },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: 'Protocolo Geral', texto: 'Declaração de Desarquivamento' })
  y = M.ficha(
    doc,
    [
      ['Processo/documento', processo.numero_documento || '—'],
      ['Caixa de origem', processo.caixa?.numero ?? '—'],
    ],
    y,
  )
  // Assunto e interessado podem ser longos: vão como texto corrido (a ficha só mostra uma linha por campo).
  y = M.paragrafo(doc, `Assunto: ${processo.assunto_processo || '—'}`, y - 4, { alinhamento: 'left' })
  y = M.paragrafo(doc, `Interessado: ${processo.interessado || '—'}`, y, { alinhamento: 'left' })
  y += 4

  y = M.paragrafo(
    doc,
    `Eu, ${solicitanteNome}, portador(a) da matrícula nº ${solicitanteMatricula}, declaro ter retirado nesta data, junto ao Protocolo Geral da CCAD/CDTIV, o processo/documento acima identificado, sob a responsabilidade de ${protocolistaNome}.`,
    y,
  )
  y = M.paragrafo(
    doc,
    `Assumo o compromisso de devolver o referido processo/documento até o dia ${format(prazoPrevisto, 'dd/MM/yyyy')}, ou de solicitar, junto ao Protocolo, a prorrogação desse prazo, caso seja necessário permanecer com o processo/documento por mais tempo.`,
    y,
  )
  y = M.localData(doc, y + 4)
  M.assinatura(doc, {
    nome: solicitanteNome,
    cargo: `Matrícula nº ${solicitanteMatricula} — assinatura do solicitante`,
    y: y + 20,
  })

  M.finalizar(doc)
  doc.save(`declaracao-desarquivamento-${processo.numero_documento || processo.id}.pdf`)
}

async function gerarDeclaracaoDevolucaoPdf(dados: {
  processo: ProcessoBusca
  solicitanteNome: string
  solicitanteMatricula: string
  desarquivadoEm: Date
  protocolistaNome: string
}) {
  const { processo, solicitanteNome, solicitanteMatricula, desarquivadoEm, protocolistaNome } = dados
  const { JsPDF, M } = await carregarModeloDocumento()
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Protocolo Geral · Arquivo'), tituloPdf: 'Declaração de Devolução' },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: 'Protocolo Geral', texto: 'Declaração de Devolução' })
  y = M.ficha(
    doc,
    [
      ['Processo/documento', processo.numero_documento || '—'],
      ['Caixa de destino', processo.caixa?.numero ?? '—'],
      ['Desarquivado em', format(desarquivadoEm, 'dd/MM/yyyy')],
    ],
    y,
  )
  y = M.paragrafo(doc, `Assunto: ${processo.assunto_processo || '—'}`, y - 4, { alinhamento: 'left' })
  y = M.paragrafo(doc, `Interessado: ${processo.interessado || '—'}`, y, { alinhamento: 'left' })
  y += 4

  y = M.paragrafo(
    doc,
    `Certifica-se que o processo/documento acima identificado, desarquivado em ${format(desarquivadoEm, 'dd/MM/yyyy')} por ${solicitanteNome}, matrícula nº ${solicitanteMatricula}, foi devolvido nesta data ao Protocolo Geral da CCAD/CDTIV e recomposto na respectiva caixa do Arquivo Geral.`,
    y,
  )
  y = M.localData(doc, y + 4)
  M.assinatura(doc, {
    nome: protocolistaNome,
    cargo: 'Protocolo Geral — CCAD/CDTIV, responsável pelo recebimento',
    y: y + 20,
  })

  M.finalizar(doc)
  doc.save(`declaracao-devolucao-${processo.numero_documento || processo.id}.pdf`)
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

      await gerarDeclaracaoDesarquivamentoPdf({
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
          <p className="text-xs text-gray-500 mt-1">
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

function ModalRegistrarDevolucao({
  processo,
  emprestimo,
  protocolistaNome,
  onClose,
  onConfirmado,
}: {
  processo: ProcessoBusca
  emprestimo: NonNullable<ReturnType<typeof emprestimoAtivo>>
  protocolistaNome: string
  onClose: () => void
  onConfirmado: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleConfirmar() {
    setSalvando(true)
    setErro('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada, faça login novamente.')

      const { error: erroUpdateEmprestimo } = await supabase
        .from('emprestimos')
        .update({ devolvido_em: new Date().toISOString(), recebido_por_id: user.id })
        .eq('id', emprestimo.id)
      if (erroUpdateEmprestimo) throw erroUpdateEmprestimo

      const { error: erroUpdateProcesso } = await supabase
        .from('processos')
        .update({ status_emprestimo: 'arquivado' })
        .eq('id', processo.id)
      if (erroUpdateProcesso) throw erroUpdateProcesso

      await gerarDeclaracaoDevolucaoPdf({
        processo,
        solicitanteNome: emprestimo.solicitante_nome,
        solicitanteMatricula: emprestimo.solicitante_matricula,
        desarquivadoEm: new Date(emprestimo.desarquivado_em),
        protocolistaNome,
      })

      onConfirmado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a devolução.')
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
              <Undo2 size={18} className="text-navy-600" /> Registrar Devolução
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Processo {processo.numero_documento} — Caixa {processo.caixa?.numero ?? '—'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <p><span className="text-gray-500">Solicitante:</span> {emprestimo.solicitante_nome}</p>
          <p><span className="text-gray-500">Matrícula:</span> {emprestimo.solicitante_matricula}</p>
          <p><span className="text-gray-500">Desarquivado em:</span> {format(new Date(emprestimo.desarquivado_em), 'dd/MM/yyyy')}</p>
          <p><span className="text-gray-500">Prazo previsto:</span> {format(new Date(`${emprestimo.prazo_previsto}T00:00:00`), 'dd/MM/yyyy')}</p>
        </div>

        <p className="text-sm text-gray-600">
          Confirme somente depois de já ter recebido fisicamente o processo/documento e recomposto na caixa de origem.
        </p>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary text-sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={salvando}
            onClick={handleConfirmar}
          >
            <CheckCircle2 size={14} /> {salvando ? 'Registrando…' : 'Confirmar Devolução'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalProrrogarPrazo({
  processo,
  emprestimo,
  protocolistaId,
  onClose,
  onConfirmado,
}: {
  processo: ProcessoBusca
  emprestimo: NonNullable<ReturnType<typeof emprestimoAtivo>>
  protocolistaId: string
  onClose: () => void
  onConfirmado: () => void
}) {
  const [novoPrazo, setNovoPrazo] = useState(
    format(addDays(new Date(`${emprestimo.prazo_previsto}T00:00:00`), PRAZO_PADRAO_DIAS), 'yyyy-MM-dd'),
  )
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const formValido = novoPrazo && novoPrazo > emprestimo.prazo_previsto

  async function handleConfirmar() {
    if (!formValido) return
    setSalvando(true)
    setErro('')
    try {
      const { error: erroInsert } = await supabase.from('emprestimo_prorrogacoes').insert({
        emprestimo_id: emprestimo.id,
        prazo_anterior: emprestimo.prazo_previsto,
        prazo_novo: novoPrazo,
        motivo: motivo.trim() || null,
        autorizado_por_id: protocolistaId,
      })
      if (erroInsert) throw erroInsert

      const { error: erroUpdate } = await supabase
        .from('emprestimos')
        .update({ prazo_previsto: novoPrazo })
        .eq('id', emprestimo.id)
      if (erroUpdate) throw erroUpdate

      onConfirmado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a prorrogação.')
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
              <CalendarClock size={18} className="text-navy-600" /> Prorrogar Prazo
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Processo {processo.numero_documento} — {emprestimo.solicitante_nome}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <p><span className="text-gray-500">Prazo atual:</span> {format(new Date(`${emprestimo.prazo_previsto}T00:00:00`), 'dd/MM/yyyy')}</p>
        </div>

        <div>
          <label className="label">Novo prazo de devolução</label>
          <input type="date" className="input" value={novoPrazo} onChange={e => setNovoPrazo(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Precisa ser depois do prazo atual.</p>
        </div>
        <div>
          <label className="label">Motivo (opcional)</label>
          <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: análise ainda em andamento" />
        </div>

        <p className="text-xs text-gray-500">
          Não é necessário novo documento assinado — a prorrogação fica registrada apenas no sistema, já prevista na Declaração de Desarquivamento original.
        </p>

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
            <CheckCircle2 size={14} /> {salvando ? 'Registrando…' : 'Confirmar Prorrogação'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BuscaProcessosPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [termo, setTermo] = useState(searchParams.get('termo') ?? '')
  const [ano, setAno] = useState('')
  const [interessado, setInteressado] = useState('')
  const [setor, setSetor] = useState('')
  const [processoParaEmprestimo, setProcessoParaEmprestimo] = useState<ProcessoBusca | null>(null)
  const [processoParaDevolucao, setProcessoParaDevolucao] = useState<ProcessoBusca | null>(null)
  const [processoParaProrrogacao, setProcessoParaProrrogacao] = useState<ProcessoBusca | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState('')

  const temFiltro = termo.trim().length >= 2 || ano.trim().length > 0 || interessado.length > 0 || setor.length > 0

  // Vem de processos.setor_origem (campo por processo, desde a Fase 15) —
  // uma caixa pode ter processos de mais de um setor.
  const { data: setores } = useQuery({
    queryKey: ['setores-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('processos').select('setor_origem').not('setor_origem', 'is', null)
      if (error) throw error
      const unicos = Array.from(new Set((data ?? []).map(p => p.setor_origem).filter((s): s is string => !!s)))
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
          '*, caixa:caixa_id(numero,setor), avaliacoes(decisao,status,confirmado_em), emprestimos(id,solicitante_nome,solicitante_matricula,desarquivado_em,prazo_previsto,devolvido_em)',
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
        query = query.eq('setor_origem', setor)
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

  function handleDevolucaoConfirmada() {
    setProcessoParaDevolucao(null)
    setMensagemSucesso('Devolução registrada e Declaração de Devolução baixada. O processo já está disponível novamente na caixa.')
    queryClient.invalidateQueries({ queryKey })
    window.setTimeout(() => setMensagemSucesso(''), 8000)
  }

  function handleProrrogacaoConfirmada() {
    setProcessoParaProrrogacao(null)
    setMensagemSucesso('Prorrogação registrada. O novo prazo já aparece na Busca — não é necessário nenhum documento assinado.')
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
        <p className="text-xs text-gray-500">
          A busca considera assunto, número do documento, interessado e o campo de ano ao mesmo tempo — não precisa saber onde a informação está.
        </p>
      </div>

      {!temFiltro ? (
        <div className="card p-10 text-center">
          <Search size={36} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Digite ao menos 2 letras ou escolha um filtro para começar a busca.</p>
        </div>
      ) : isLoading || isFetching ? (
        <p className="text-center py-10 text-gray-500">Buscando…</p>
      ) : (resultados ?? []).length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-500 text-sm">Nenhum processo encontrado com esses termos. Tente um assunto mais geral ou remova algum filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {resultados!.length} processo(s) encontrado(s){resultados!.length === 50 ? ' — mostrando os 50 primeiros, refine a busca para ver mais precisão' : ''}.
          </p>
          {resultados!.map(p => {
            const eliminadoEm = situacaoEliminacao(p)
            const emprestimo = emprestimoAtivo(p)
            const atrasado = emprestimo ? isPast(new Date(`${emprestimo.prazo_previsto}T23:59:59`)) : false
            const podeEmprestar = !eliminadoEm && p.status_emprestimo !== 'emprestado'
            const podeDevolver = p.status_emprestimo === 'emprestado' && !!emprestimo
            return (
              <div key={p.id} className="card p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-900">{p.numero_documento}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{p.interessado}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 inline-flex items-center gap-1">
                      <DataIcon />
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
                  <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold flex items-center gap-1 justify-center">
                    <Archive size={11} /> Caixa
                  </p>
                  <p className="text-base font-bold text-amber-800">{p.caixa?.numero ?? '—'}</p>
                  {(p.setor_origem ?? p.caixa?.setor) && (
                    <p className="text-xs text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
                      <MapPin size={10} /> {p.setor_origem ?? p.caixa?.setor}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-stretch gap-1">
                  {podeDevolver ? (
                    <>
                      <button
                        className="btn-secondary text-xs py-1.5 px-3"
                        title="Registrar devolução"
                        onClick={() => setProcessoParaDevolucao(p)}
                      >
                        <Undo2 size={12} /> Registrar Devolução
                      </button>
                      <button
                        className="btn-secondary text-xs py-1.5 px-3"
                        title="Prorrogar prazo"
                        onClick={() => setProcessoParaProrrogacao(p)}
                      >
                        <CalendarClock size={12} /> Prorrogar Prazo
                      </button>
                    </>
                  ) : (
                    <button
                      className={podeEmprestar ? 'btn-secondary text-xs py-1.5 px-3' : 'btn-secondary text-xs py-1.5 px-3 opacity-60 cursor-not-allowed'}
                      disabled={!podeEmprestar}
                      title={eliminadoEm ? 'Processo já eliminado' : 'Registrar desarquivamento'}
                      onClick={() => podeEmprestar && setProcessoParaEmprestimo(p)}
                    >
                      <Clock size={12} /> Solicitar Empréstimo
                    </button>
                  )}
                  {!podeEmprestar && !podeDevolver && (
                    <p className="text-xs text-gray-500 text-center">
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

      {processoParaDevolucao && emprestimoAtivo(processoParaDevolucao) && (
        <ModalRegistrarDevolucao
          processo={processoParaDevolucao}
          emprestimo={emprestimoAtivo(processoParaDevolucao)!}
          protocolistaNome={profile?.nome ?? '—'}
          onClose={() => setProcessoParaDevolucao(null)}
          onConfirmado={handleDevolucaoConfirmada}
        />
      )}

      {processoParaProrrogacao && emprestimoAtivo(processoParaProrrogacao) && profile && (
        <ModalProrrogarPrazo
          processo={processoParaProrrogacao}
          emprestimo={emprestimoAtivo(processoParaProrrogacao)!}
          protocolistaId={profile.id}
          onClose={() => setProcessoParaProrrogacao(null)}
          onConfirmado={handleProrrogacaoConfirmada}
        />
      )}
    </div>
  )
}
