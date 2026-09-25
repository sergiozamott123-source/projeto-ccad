import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Undo2, ChevronDown, ChevronUp, PencilLine, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay } from 'date-fns'
import type { Avaliacao, TtdCodigo } from '@/lib/database.types'
import { TtdCodigoPicker } from '@/components/TtdCodigoPicker'
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

export function ConfirmarEliminacoesPage() {
  const { profile, isCoord } = useAuth()
  const qc = useQueryClient()
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [corrigindoId, setCorrigindoId] = useState<string | null>(null)
  const [novoTtd, setNovoTtd] = useState<TtdCodigo | null>(null)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('avaliacoes')
        .update({ status: 'confirmada', confirmado_por: profile!.id, confirmado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })

  const devolver = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from('avaliacoes')
        .update({ status: 'devolvida', motivo_devolucao: motivo, confirmado_por: profile!.id, confirmado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidar()
      setDevolvendoId(null)
      setMotivo('')
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
        const { error: e1 } = await supabase
          .from('processos')
          .update({ ttd_codigo_id: ttd.id })
          .eq('id', avaliacao.processo_id)
        if (e1) throw e1
      }
      const { error: e2 } = await supabase
        .from('avaliacoes')
        .update({
          status: 'confirmada',
          decisao: ttd.destinacao_final,
          confirmado_por: profile!.id,
          confirmado_em: new Date().toISOString(),
          codigo_original_id: avaliacao.processo?.ttd?.id ?? null,
        })
        .eq('id', avaliacao.id)
      if (e2) throw e2
    },
    onSuccess: () => {
      invalidar()
      setCorrigindoId(null)
      setNovoTtd(null)
    },
  })

  if (!profile) return null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Confirmar Eliminações</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {podeVerTudo ? 'Todas as eliminações pendentes de conferência.' : 'Eliminações pendentes da sua equipe.'}
        </p>
      </div>

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

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : (pendentes ?? []).length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle size={36} className="text-teal-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma eliminação aguardando confirmação no momento.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(pendentes ?? []).map(p => (
              <div key={p.id} className="py-4 px-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-mono font-semibold text-gray-900 text-sm">{p.processo?.numero_documento}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Eliminação</span>
                      {p.processo?.caixa && <span className="text-xs text-gray-400">Caixa {p.processo.caixa.numero}</span>}
                    </div>
                    {p.processo?.assunto_processo && (
                      <p className="text-sm text-gray-600 truncate max-w-md">{p.processo.assunto_processo}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Avaliado por {p.avaliador?.nome ?? '—'} · {format(new Date(p.created_at), 'dd/MM HH:mm')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={confirmar.isPending}
                      onClick={() => confirmar.mutate(p.id)}
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
                      <span className="text-gray-400">Código usado:</span>
                      <span className="font-mono font-semibold text-gray-800">{p.processo?.ttd?.codigo ?? '—'}</span>
                      {p.processo?.ttd?.assunto && (
                        <span className="text-gray-600 truncate">{p.processo.ttd.assunto}</span>
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
                        <span className="text-gray-400">Classe/Série TTD: </span>
                        <span className="text-gray-700">{[p.processo?.ttd?.classe, p.processo?.ttd?.serie].filter(Boolean).join(' / ') || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Destinação final na TTD: </span>
                        <span className="text-red-600 font-medium">{p.processo?.ttd?.destinacao_final || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Fase corrente/intermediária: </span>
                        <span className="text-gray-700">{[p.processo?.ttd?.fase_corrente, p.processo?.ttd?.fase_intermediaria].filter(Boolean).join(' / ') || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Interessado: </span>
                        <span className="text-gray-700">{p.processo?.interessado || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Última movimentação: </span>
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
                        onClick={() => devolver.mutate({ id: p.id, motivo: motivo.trim() })}
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
                    {corrigirEConfirmar.isError && (
                      <p className="mt-2 text-xs text-red-600">Não foi possível salvar a correção. Tente novamente.</p>
                    )}
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
            <p className="text-xs text-gray-400 mb-2">
              Mostrando as 50 devoluções mais recentes{podeVerTudo ? '' : ' da sua equipe'}, do mais novo para o mais antigo.
            </p>
            {carregandoHistorico ? (
              <p className="text-center py-6 text-gray-400 text-sm">Carregando…</p>
            ) : (historico ?? []).length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">Nenhuma devolução registrada até o momento.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {(historico ?? []).map(h => (
                  <div key={h.id} className="py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{h.processo?.numero_documento}</span>
                          {h.processo?.caixa && <span className="text-xs text-gray-400">Caixa {h.processo.caixa.numero}</span>}
                        </div>
                        <p className="text-xs text-gray-500">
                          Avaliado por {h.avaliador?.nome ?? '—'} · devolvido por {h.devolvido_por?.nome ?? '—'}
                          {h.confirmado_em && <> em {format(new Date(h.confirmado_em), 'dd/MM/yyyy HH:mm')}</>}
                        </p>
                      </div>
                      {h.proximo ? (
                        <span
                          className={clsx(
                            'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                            h.proximo.status === 'confirmada' && 'bg-teal-100 text-teal-700',
                            h.proximo.status === 'devolvida' && 'bg-red-100 text-red-700',
                            h.proximo.status === 'aguardando_confirmacao' && 'bg-amber-100 text-amber-700'
                          )}
                        >
                          {h.proximo.status === 'confirmada' && 'Refeito e confirmado'}
                          {h.proximo.status === 'devolvida' && 'Refeito e devolvido novamente'}
                          {h.proximo.status === 'aguardando_confirmacao' && 'Refeito, aguardando nova confirmação'}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 shrink-0">
                          Aguardando o avaliador refazer
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
  )
}
