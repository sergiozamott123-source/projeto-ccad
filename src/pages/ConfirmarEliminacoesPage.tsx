import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, CheckCircle2, Clock, Undo2, ChevronDown, ChevronUp, PencilLine, History, CheckSquare, BookOpen, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay } from 'date-fns'
import type { Avaliacao, TtdCodigo } from '@/lib/database.types'
import { TtdCodigoPicker } from '@/components/TtdCodigoPicker'
import { PainelTtd } from '@/components/PainelTtd'
import { DecisaoBadge } from '@/components/badges/DecisaoBadges'
import clsx from 'clsx'

type HistoricoDevolucao = {
  id: string
  processo_id: string
  motivo_devolucao: string | null
  confirmado_em: string | null
  created_at: string
  processo: { numero_documento: string; caixa: { numero: string } | null } | null
  avaliador: { nome: string } | null
  devolvido_por: { nome: string } | null
  proximo: { status: Avaliacao['status']; created_at: string } | null
}

type AvaliacaoFila = Avaliacao & {
  processo: {
    numero_documento: string
    ano_producao: number | null
    assunto_processo: string | null
    interessado: string | null
    data_ultima_movimentacao: string | null
    sem_data_ultima_movimentacao: boolean
    caixa: { numero: string } | null
    ttd: TtdCodigo | null
  }
  avaliador: { nome: string } | null
}

// Erro "mudo": o banco aceita o comando mas não altera nenhuma linha (regra de
// segurança, ou o item já mudou de estado). Antes, a tela tratava isso como
// sucesso. Agora toda gravação confere quantas linhas mudaram de verdade.
const NAO_GRAVADO = 'NAO_GRAVADO'

function mensagemDeErro(e: unknown): string {
  if (e instanceof Error && e.message === NAO_GRAVADO) {
    return 'O Portal não gravou essa ação — talvez o item já tenha sido tratado por outra pessoa, ou falte permissão. Nada foi alterado: o processo continua na fila. Atualize a página e tente de novo; se repetir, avise o Coordenador.'
  }
  return 'Não foi possível gravar agora (falha de conexão ou do Portal). Nada foi alterado: o processo continua na fila. Tente de novo em instantes; se repetir, avise o Coordenador.'
}

export function ConfirmarEliminacoesPage() {
  const { profile, isCoord } = useAuth()
  const qc = useQueryClient()
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [corrigindoId, setCorrigindoId] = useState<string | null>(null)
  const [novoTtd, setNovoTtd] = useState<TtdCodigo | null>(null)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

  // Consulta à TTD (painel ao lado / quadro por cima) e avisos de resultado
  const [ttdAberta, setTtdAberta] = useState(false)
  const [buscaTtd, setBuscaTtd] = useState('')
  const [codigoDestaque, setCodigoDestaque] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function mostrarAviso(texto: string) {
    setAviso(texto)
    window.setTimeout(() => setAviso(atual => (atual === texto ? null : atual)), 5000)
  }

  function verNaTtd(codigo: string | null | undefined) {
    setBuscaTtd(codigo ?? '')
    setCodigoDestaque(codigo ?? null)
    setTtdAberta(true)
  }

  // Código escolhido para a correção em lote (quando várias eliminações
  // selecionadas devem receber o mesmo código novo de uma vez).
  const [ttdLote, setTtdLote] = useState<TtdCodigo | null>(null)

  // Seleção em lote — mesmo padrão já usado na Fila de Revisão Manual:
  // marca vários itens pendentes (ex.: todos do mesmo assunto/tema) e
  // confirma todos de uma vez, em vez de um por um.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  function alternarSelecionado(id: string, marcar: boolean) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (marcar) novo.add(id)
      else novo.delete(id)
      return novo
    })
  }

  function alternarSelecionarTodos(marcar: boolean) {
    setSelecionados(marcar ? new Set((pendentes ?? []).map(p => p.id)) : new Set())
  }

  function abrirDevolver(id: string) {
    setDevolvendoId(devolvendoId === id ? null : id)
    setMotivo('')
    setCorrigindoId(null)
    setNovoTtd(null)
  }

  function abrirCorrigir(id: string) {
    setCorrigindoId(corrigindoId === id ? null : id)
    setNovoTtd(null)
    setDevolvendoId(null)
    setMotivo('')
  }

  // Quem tem a permissão individual `pode_confirmar_eliminacoes` (ex.: Ariadne)
  // vê e confirma a fila inteira, de todos os pilares — igual ao Coordenador —
  // porque faz essa conferência em nome dele, não só pela própria área.
  const podeVerTudo = isCoord || profile?.pode_confirmar_eliminacoes === true

  // Perfil "conferência" (Ariadne e Júlia): tela com a TTD sempre ao lado e
  // explicações em passos. Para os demais, a TTD abre só por botão.
  const modoConferencia = profile?.menu_perfil === 'conferencia'

  const hoje = startOfDay(new Date()).toISOString()

  const { data: pendentes, isLoading } = useQuery({
    queryKey: ['confirmar-eliminacoes', profile?.id, profile?.pilar_id, podeVerTudo],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('*, processo:processo_id(numero_documento, ano_producao, assunto_processo, interessado, data_ultima_movimentacao, sem_data_ultima_movimentacao, caixa:caixa_id(numero), ttd:ttd_codigo_id(*)), avaliador:avaliado_por(nome)')
        .eq('status', 'aguardando_confirmacao')
        .order('created_at', { ascending: true })

      if (!podeVerTudo) query = query.eq('pilar_id', profile!.pilar_id)

      const { data } = await query
      return (data ?? []) as AvaliacaoFila[]
    },
    enabled: !!profile,
  })

  const { data: statsHoje } = useQuery({
    queryKey: ['confirmar-eliminacoes-stats', profile?.id, hoje],
    queryFn: async () => {
      const [confirmadas, devolvidas] = await Promise.all([
        supabase.from('avaliacoes').select('*', { count: 'exact', head: true })
          .eq('confirmado_por', profile!.id).eq('status', 'confirmada').gte('confirmado_em', hoje),
        supabase.from('avaliacoes').select('*', { count: 'exact', head: true })
          .eq('confirmado_por', profile!.id).eq('status', 'devolvida').gte('confirmado_em', hoje),
      ])
      return { confirmadas: confirmadas.count ?? 0, devolvidas: devolvidas.count ?? 0 }
    },
    enabled: !!profile?.id,
  })

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['confirmar-eliminacoes'] })
    qc.invalidateQueries({ queryKey: ['confirmar-eliminacoes-stats'] })
    qc.invalidateQueries({ queryKey: ['historico-devolucoes'] })
    // Mesmo bug encontrado e corrigido em ConferenciaCaixasPage.tsx
    // (02/10/2026): o contador da "bolinha" no menu (AppLayout.tsx) é uma
    // consulta separada (`eliminacoes-pendentes-count`) — sem invalidar ela
    // aqui, o número do menu ficaria desatualizado até a página recarregar.
    qc.invalidateQueries({ queryKey: ['eliminacoes-pendentes-count'] })
  }

  // Histórico de devoluções — só carrega quando o painel é aberto, para não
  // pesar a tela no dia a dia. Para cada devolução, verifica se já existe uma
  // avaliação mais nova do mesmo processo (ou seja, se o avaliador já refez)
  // e qual foi o resultado dessa nova avaliação — é isso que dá a "prova" de
  // que a devolução realmente chegou e foi tratada, e não só desapareceu da fila.
  const { data: historico, isLoading: carregandoHistorico } = useQuery({
    queryKey: ['historico-devolucoes', profile?.id, profile?.pilar_id, podeVerTudo, mostrarHistorico],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('id, processo_id, motivo_devolucao, confirmado_em, created_at, processo:processo_id(numero_documento, caixa:caixa_id(numero)), avaliador:avaliado_por(nome), devolvido_por:confirmado_por(nome)')
        .eq('status', 'devolvida')
        .order('confirmado_em', { ascending: false })
        .limit(50)

      if (!podeVerTudo) query = query.eq('pilar_id', profile!.pilar_id)

      const { data: devolvidas } = await query
      const lista = (devolvidas ?? []) as unknown as HistoricoDevolucao[]
      if (lista.length === 0) return lista

      const processoIds = Array.from(new Set(lista.map(l => l.processo_id)))
      const { data: todasAvaliacoes } = await supabase
        .from('avaliacoes')
        .select('id, processo_id, status, created_at')
        .in('processo_id', processoIds)
        .order('created_at', { ascending: true })

      const porProcesso = new Map<string, { id: string; status: Avaliacao['status']; created_at: string }[]>()
      for (const a of todasAvaliacoes ?? []) {
        if (!porProcesso.has(a.processo_id)) porProcesso.set(a.processo_id, [])
        porProcesso.get(a.processo_id)!.push(a)
      }

      return lista.map(item => {
        const linha = porProcesso.get(item.processo_id) ?? []
        const idx = linha.findIndex(a => a.id === item.id)
        const proximo = idx >= 0 ? linha[idx + 1] : undefined
        return { ...item, proximo: proximo ? { status: proximo.status, created_at: proximo.created_at } : null }
      })
    },
    enabled: !!profile && mostrarHistorico,
  })

  const confirmar = useMutation({
    mutationFn: async (p: AvaliacaoFila) => {
      const { data, error } = await supabase
        .from('avaliacoes')
        .update({ status: 'confirmada', confirmado_por: profile!.id, confirmado_em: new Date().toISOString() })
        .eq('id', p.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error(NAO_GRAVADO)
    },
    onMutate: () => setErroAcao(null),
    onError: e => setErroAcao(mensagemDeErro(e)),
    onSuccess: (_data, p) => {
      invalidar()
      alternarSelecionado(p.id, false)
      mostrarAviso(`Confirmado: processo ${p.processo?.numero_documento ?? ''}.`)
    },
  })

  // Confirma em lote — mesma ação de "Confirmar" de cada item, aplicada de
  // uma vez a todos os ids marcados (não muda código nem grava motivo,
  // é só a confirmação "como está", igual à individual).
  const confirmarLote = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase
        .from('avaliacoes')
        .update({ status: 'confirmada', confirmado_por: profile!.id, confirmado_em: new Date().toISOString() })
        .in('id', ids)
        .select('id')
      if (error) throw error
      if (!data || data.length < ids.length) {
        // Alguns foram gravados e outros não: atualiza a fila para mostrar o que sobrou.
        invalidar()
        throw new Error(NAO_GRAVADO)
      }
      return ids.length
    },
    onMutate: () => setErroAcao(null),
    onError: e => setErroAcao(mensagemDeErro(e)),
    onSuccess: total => {
      invalidar()
      setSelecionados(new Set())
      mostrarAviso(`${total} avaliação(ões) confirmada(s).`)
    },
  })

  const devolver = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string; numero?: string }) => {
      const { data, error } = await supabase
        .from('avaliacoes')
        .update({ status: 'devolvida', motivo_devolucao: motivo, confirmado_por: profile!.id, confirmado_em: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error(NAO_GRAVADO)
    },
    onMutate: () => setErroAcao(null),
    onError: e => setErroAcao(mensagemDeErro(e)),
    onSuccess: (_data, { id, numero }) => {
      invalidar()
      setDevolvendoId(null)
      setMotivo('')
      alternarSelecionado(id, false)
      mostrarAviso(`Devolvido ao avaliador: processo ${numero ?? ''}.`)
    },
  })

  // Corrige o código na hora (quando o Coordenador prefere ele mesmo ajustar
  // um erro pontual, em vez de devolver para o avaliador refazer) — atualiza
  // a classificação do processo e já confirma a eliminação com o código
  // certo. Guarda o código original em `codigo_original_id` só para efeito
  // de registro/acompanhamento (não muda nada visível para o avaliador).
  const corrigirEConfirmar = useMutation({
    mutationFn: async ({ avaliacao, ttd }: { avaliacao: AvaliacaoFila; ttd: TtdCodigo }) => {
      if (avaliacao.processo?.ttd?.id !== ttd.id) {
        const { data: d1, error: e1 } = await supabase
          .from('processos')
          .update({ ttd_codigo_id: ttd.id })
          .eq('id', avaliacao.processo_id)
          .select('id')
        if (e1) throw e1
        if (!d1 || d1.length === 0) throw new Error(NAO_GRAVADO)
      }
      const { data: d2, error: e2 } = await supabase
        .from('avaliacoes')
        .update({
          status: 'confirmada',
          decisao: ttd.destinacao_final,
          confirmado_por: profile!.id,
          confirmado_em: new Date().toISOString(),
          codigo_original_id: avaliacao.processo?.ttd?.id ?? null,
        })
        .eq('id', avaliacao.id)
        .select('id')
      if (e2) throw e2
      if (!d2 || d2.length === 0) throw new Error(NAO_GRAVADO)
    },
    onMutate: () => setErroAcao(null),
    onError: e => setErroAcao(mensagemDeErro(e)),
    onSuccess: (_data, { avaliacao, ttd }) => {
      invalidar()
      setCorrigindoId(null)
      setNovoTtd(null)
      alternarSelecionado(avaliacao.id, false)
      mostrarAviso(`Código corrigido para ${ttd.codigo} e confirmado: processo ${avaliacao.processo?.numero_documento ?? ''}.`)
    },
  })

  // Corrige em lote — mesma lógica da correção individual (troca o código do
  // processo, ajusta a decisão e confirma), só que aplicada de uma vez a
  // todas as eliminações marcadas que vão receber o MESMO código novo. Cada
  // avaliação guarda o próprio código original em `codigo_original_id` (pode
  // ser um código diferente para cada uma), por isso a parte de `avaliacoes`
  // é feita item a item, em paralelo — só a atualização do código do
  // processo é que sai numa única chamada, porque aí o valor novo é igual
  // para todos.
  const corrigirLote = useMutation({
    mutationFn: async ({ avaliacoes, ttd }: { avaliacoes: AvaliacaoFila[]; ttd: TtdCodigo }) => {
      const processoIds = Array.from(new Set(
        avaliacoes.filter(a => a.processo?.ttd?.id !== ttd.id).map(a => a.processo_id)
      ))
      if (processoIds.length > 0) {
        const { data: d1, error: e1 } = await supabase
          .from('processos')
          .update({ ttd_codigo_id: ttd.id })
          .in('id', processoIds)
          .select('id')
        if (e1) throw e1
        if (!d1 || d1.length < processoIds.length) throw new Error(NAO_GRAVADO)
      }
      const resultados = await Promise.all(avaliacoes.map(avaliacao =>
        supabase
          .from('avaliacoes')
          .update({
            status: 'confirmada',
            decisao: ttd.destinacao_final,
            confirmado_por: profile!.id,
            confirmado_em: new Date().toISOString(),
            codigo_original_id: avaliacao.processo?.ttd?.id ?? null,
          })
          .eq('id', avaliacao.id)
          .select('id')
      ))
      const comErro = resultados.find(r => r.error)
      if (comErro?.error) throw comErro.error
      if (resultados.some(r => !r.data || r.data.length === 0)) {
        invalidar()
        throw new Error(NAO_GRAVADO)
      }
      return avaliacoes.length
    },
    onMutate: () => setErroAcao(null),
    onError: e => setErroAcao(mensagemDeErro(e)),
    onSuccess: (total, { ttd }) => {
      invalidar()
      setSelecionados(new Set())
      setTtdLote(null)
      mostrarAviso(`${total} avaliação(ões) corrigida(s) para ${ttd.codigo} e confirmada(s).`)
    },
  })

  if (!profile) return null

  return (
    <div className={clsx(modoConferencia && 'lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-5')}>
    <div className="space-y-5 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {modoConferencia ? 'Conferir avaliações' : 'Confirmar Eliminações'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {modoConferencia
              ? 'Os avaliadores já classificaram estes processos. Confira se o código da TTD está certo.'
              : podeVerTudo ? 'Todas as eliminações pendentes de conferência.' : 'Eliminações pendentes da sua equipe.'}
          </p>
        </div>
        <button
          type="button"
          className={clsx('btn-secondary text-sm', modoConferencia && 'lg:hidden')}
          onClick={() => setTtdAberta(true)}
        >
          <BookOpen size={14} /> Consultar TTD
        </button>
      </div>

      {erroAcao && (
        <div role="alert" className="sticky top-0 z-20 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <p className="flex-1">{erroAcao}</p>
          <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => setErroAcao(null)}>Fechar</button>
        </div>
      )}
      {aviso && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-800">
          <CheckCircle2 size={16} className="shrink-0 text-teal-600" />
          <p>{aviso}</p>
        </div>
      )}

      {modoConferencia && (
        <details open className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">Como conferir, em 3 passos</summary>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            <li className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="mb-1 text-sm font-semibold text-gray-900">1. Veja o código usado</p>
              Em cada processo, o código que o avaliador escolheu aparece na faixa cinza.
            </li>
            <li className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="mb-1 text-sm font-semibold text-gray-900">2. Confira na TTD</p>
              Clique em <strong>Ver na TTD</strong>: a tabela ao lado abre nesse código, com a destinação final.
            </li>
            <li className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
              <p className="mb-1 text-sm font-semibold text-gray-900">3. Decida</p>
              <strong>Confirmar</strong>: o código está certo.<br />
              <strong>Corrigir código</strong>: você escolhe o certo e já confirma.<br />
              <strong>Devolver</strong>: o avaliador refaz e vê o motivo que você escrever.
            </li>
          </ol>
        </details>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500">Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{(pendentes ?? []).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Confirmadas hoje</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">{statsHoje?.confirmadas ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500">Devolvidas hoje</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{statsHoje?.devolvidas ?? 0}</p>
        </div>
      </div>

      {/* Barra de ações em lote — aparece assim que algum item é marcado.
          Duas opções: confirmar todas "como estão" (mesmo código de cada
          uma), ou corrigir todas de uma vez para um único código novo
          (quando os selecionados são do mesmo assunto/tema). */}
      {selecionados.size > 0 && (
        <div className="card p-3 sm:p-4 bg-teal-50 border-teal-200 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-teal-800 font-medium">
              {selecionados.size} eliminação(ões) selecionada(s)
            </p>
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-3"
              onClick={() => { setSelecionados(new Set()); setTtdLote(null) }}
            >
              Limpar seleção
            </button>
          </div>

          <button
            className="btn-primary text-xs py-1.5 px-3"
            disabled={confirmarLote.isPending}
            onClick={() => confirmarLote.mutate(Array.from(selecionados))}
          >
            <CheckSquare size={13} />
            {confirmarLote.isPending
              ? 'Confirmando…'
              : `Confirmar ${selecionados.size} eliminação(ões) como estão`}
          </button>

          <div className="pt-3 border-t border-teal-200">
            <label className="label text-teal-800">
              Ou corrigir todas as {selecionados.size} selecionadas para o mesmo código:
            </label>
            <TtdCodigoPicker value={ttdLote} onSelect={setTtdLote} />
            <button
              className="btn-primary text-xs py-1.5 px-3 mt-2"
              disabled={!ttdLote || corrigirLote.isPending}
              onClick={() => {
                const avaliacoesSelecionadas = (pendentes ?? []).filter(p => selecionados.has(p.id))
                corrigirLote.mutate({ avaliacoes: avaliacoesSelecionadas, ttd: ttdLote! })
              }}
            >
              <PencilLine size={13} />
              {corrigirLote.isPending
                ? 'Corrigindo…'
                : `Corrigir ${selecionados.size} eliminação(ões) para este código`}
            </button>
          </div>
        </div>
      )}

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-500">Carregando…</p>
        ) : (pendentes ?? []).length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle size={36} className="text-teal-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{modoConferencia ? 'Tudo conferido! Nenhuma avaliação aguardando conferência.' : 'Nenhuma eliminação aguardando confirmação no momento.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <label className="flex items-center gap-2 py-2 px-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={selecionados.size > 0 && selecionados.size === (pendentes ?? []).length}
                onChange={e => alternarSelecionarTodos(e.target.checked)}
              />
              Selecionar todos os {(pendentes ?? []).length} pendente(s)
            </label>
            {(pendentes ?? []).map(p => (
              <div key={p.id} className="py-4 px-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={selecionados.has(p.id)}
                      onChange={e => alternarSelecionado(p.id, e.target.checked)}
                      aria-label={`Selecionar eliminação ${p.processo?.numero_documento ?? p.id}`}
                    />
                    <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-mono font-semibold text-gray-900 text-sm">{p.processo?.numero_documento}</span>
                      <DecisaoBadge destino={p.processo?.ttd?.destinacao_final ?? 'Eliminação'} />
                      {p.processo?.caixa && <span className="text-xs text-gray-500">Caixa {p.processo.caixa.numero}</span>}
                    </div>
                    {p.processo?.assunto_processo && (
                      <p className="text-sm text-gray-600 truncate max-w-md">{p.processo.assunto_processo}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      Avaliado por {p.avaliador?.nome ?? '—'} · {format(new Date(p.created_at), 'dd/MM HH:mm')}
                    </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={confirmar.isPending}
                      onClick={() => confirmar.mutate(p)}
                    >
                      <CheckCircle size={13} /> Confirmar
                    </button>
                    <button
                      className="btn-secondary text-xs py-1.5 px-3 border-teal-200 text-teal-700"
                      onClick={() => abrirCorrigir(p.id)}
                    >
                      <PencilLine size={13} /> Corrigir código
                    </button>
                    <button
                      className="btn-secondary text-xs py-1.5 px-3 border-red-200 text-red-700"
                      onClick={() => abrirDevolver(p.id)}
                    >
                      <Undo2 size={13} /> Devolver
                    </button>
                  </div>
                </div>

                {/* Detalhamento da avaliação — qual código TTD o avaliador
                    usou e por quê, para o Coordenador poder de fato
                    conferir a decisão antes de confirmar. */}
                <div className="mt-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-gray-500">Código usado:</span>
                      <span className="font-mono font-semibold text-gray-800">{p.processo?.ttd?.codigo ?? '—'}</span>
                      {p.processo?.ttd?.assunto && (
                        <span className="text-gray-600 truncate">{p.processo.ttd.assunto}</span>
                      )}
                      {p.processo?.ttd?.codigo && (
                        <button
                          type="button"
                          className="text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 shrink-0"
                          onClick={() => verNaTtd(p.processo.ttd?.codigo)}
                        >
                          <BookOpen size={12} /> Ver na TTD
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 shrink-0"
                      onClick={() => setExpandidoId(expandidoId === p.id ? null : p.id)}
                    >
                      {expandidoId === p.id ? <>Ver menos <ChevronUp size={12} /></> : <>Ver detalhes <ChevronDown size={12} /></>}
                    </button>
                  </div>

                  {expandidoId === p.id && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      <div>
                        <span className="text-gray-500">Classe/Série TTD: </span>
                        <span className="text-gray-700">{[p.processo?.ttd?.classe, p.processo?.ttd?.serie].filter(Boolean).join(' / ') || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Destinação final na TTD: </span>
                        <DecisaoBadge destino={p.processo?.ttd?.destinacao_final} />
                      </div>
                      <div>
                        <span className="text-gray-500">Fase corrente/intermediária: </span>
                        <span className="text-gray-700">{[p.processo?.ttd?.fase_corrente, p.processo?.ttd?.fase_intermediaria].filter(Boolean).join(' / ') || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Interessado: </span>
                        <span className="text-gray-700">{p.processo?.interessado || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Última movimentação: </span>
                        <span className="text-gray-700">
                          {p.processo?.sem_data_ultima_movimentacao
                            ? 'Não há data de último despacho'
                            : p.processo?.data_ultima_movimentacao
                            ? format(new Date(p.processo.data_ultima_movimentacao), 'dd/MM/yyyy')
                            : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {devolvendoId === p.id && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                    <label className="label text-red-800">Motivo da devolução (o avaliador vai ver esta observação)</label>
                    <textarea
                      className="input min-h-[60px] resize-y mb-2"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Explique o que precisa ser revisto…"
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-danger text-xs py-1.5 px-3"
                        disabled={!motivo.trim() || devolver.isPending}
                        onClick={() => devolver.mutate({ id: p.id, motivo: motivo.trim(), numero: p.processo?.numero_documento })}
                      >
                        Enviar devolução
                      </button>
                      <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => { setDevolvendoId(null); setMotivo('') }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {corrigindoId === p.id && (
                  <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <label className="label text-teal-800">
                      Escolha o código correto — a eliminação já é confirmada com o código novo
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Código usado pelo avaliador: <span className="font-mono font-semibold text-gray-700">{p.processo?.ttd?.codigo ?? '—'}</span>
                    </p>
                    <TtdCodigoPicker value={novoTtd} onSelect={setNovoTtd} />
                    <div className="flex gap-2 mt-3">
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        disabled={!novoTtd || corrigirEConfirmar.isPending}
                        onClick={() => corrigirEConfirmar.mutate({ avaliacao: p, ttd: novoTtd! })}
                      >
                        {corrigirEConfirmar.isPending ? 'Corrigindo…' : 'Corrigir e confirmar'}
                      </button>
                      <button
                        className="btn-secondary text-xs py-1.5 px-3"
                        onClick={() => { setCorrigindoId(null); setNovoTtd(null) }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-3 sm:p-4">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setMostrarHistorico(v => !v)}
        >
          <span className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <History size={16} className="text-gray-400" /> Histórico de devoluções
          </span>
          {mostrarHistorico ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {mostrarHistorico && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              Mostrando as 50 devoluções mais recentes{podeVerTudo ? '' : ' da sua equipe'}, do mais novo para o mais antigo.
            </p>
            {carregandoHistorico ? (
              <p className="text-center py-6 text-gray-500 text-sm">Carregando…</p>
            ) : (historico ?? []).length === 0 ? (
              <p className="text-center py-6 text-gray-500 text-sm">Nenhuma devolução registrada até o momento.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {(historico ?? []).map(h => (
                  <div key={h.id} className="py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{h.processo?.numero_documento}</span>
                          {h.processo?.caixa && <span className="text-xs text-gray-500">Caixa {h.processo.caixa.numero}</span>}
                        </div>
                        <p className="text-xs text-gray-500">
                          Avaliado por {h.avaliador?.nome ?? '—'} · devolvido por {h.devolvido_por?.nome ?? '—'}
                          {h.confirmado_em && <> em {format(new Date(h.confirmado_em), 'dd/MM/yyyy HH:mm')}</>}
                        </p>
                      </div>
                      {h.proximo ? (
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                            h.proximo.status === 'confirmada' && 'bg-teal-100 text-teal-700',
                            h.proximo.status === 'devolvida' && 'bg-red-100 text-red-700',
                            h.proximo.status === 'aguardando_confirmacao' && 'bg-amber-100 text-amber-700'
                          )}
                        >
                          {h.proximo.status === 'confirmada' && <><CheckCircle2 size={11} /> Refeito e confirmado</>}
                          {h.proximo.status === 'devolvida' && <><Undo2 size={11} /> Refeito e devolvido novamente</>}
                          {h.proximo.status === 'aguardando_confirmacao' && <><Clock size={11} /> Refeito, aguardando nova confirmação</>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 shrink-0">
                          <Clock size={11} /> Aguardando o avaliador refazer
                        </span>
                      )}
                    </div>
                    {h.motivo_devolucao && (
                      <p className="text-xs text-gray-600 mt-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                        "{h.motivo_devolucao}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {modoConferencia && (
      <aside className="hidden lg:block lg:sticky lg:top-0 lg:h-[calc(100vh-6rem)]">
        <PainelTtd busca={buscaTtd} onBusca={setBuscaTtd} codigoEmDestaque={codigoDestaque} />
      </aside>
    )}

    {ttdAberta && (
      <div className={clsx('fixed inset-0 z-50 flex items-stretch justify-end', modoConferencia && 'lg:hidden')}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setTtdAberta(false)} />
        <div className="relative h-full w-full sm:w-[460px] bg-gray-50 p-2 shadow-2xl">
          <PainelTtd
            busca={buscaTtd}
            onBusca={setBuscaTtd}
            codigoEmDestaque={codigoDestaque}
            onFechar={() => setTtdAberta(false)}
          />
        </div>
      </div>
    )}
    </div>
  )
}
