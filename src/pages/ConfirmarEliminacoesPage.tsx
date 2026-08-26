import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Undo2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay } from 'date-fns'
import type { Avaliacao, TtdCodigo } from '@/lib/database.types'

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

  const hoje = startOfDay(new Date()).toISOString()

  const { data: pendentes, isLoading } = useQuery({
    queryKey: ['confirmar-eliminacoes', profile?.id, profile?.pilar_id, isCoord],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('*, processo:processo_id(numero_documento, ano_producao, assunto_processo, interessado, data_ultima_movimentacao, sem_data_ultima_movimentacao, caixa:caixa_id(numero), ttd:ttd_codigo_id(*)), avaliador:avaliado_por(nome)')
        .eq('status', 'aguardando_confirmacao')
        .order('created_at', { ascending: true })

      if (!isCoord) query = query.eq('pilar_id', profile!.pilar_id)

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
  }

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

  if (!profile) return null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Confirmar Eliminações</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {isCoord ? 'Todas as eliminações pendentes de conferência.' : 'Eliminações pendentes da sua equipe.'}
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
                      className="btn-secondary text-xs py-1.5 px-3 border-red-200 text-red-700"
                      onClick={() => { setDevolvendoId(devolvendoId === p.id ? null : p.id); setMotivo('') }}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
