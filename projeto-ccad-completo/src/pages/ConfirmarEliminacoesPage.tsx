import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay } from 'date-fns'
import type { Avaliacao } from '@/lib/database.types'

type AvaliacaoFila = Avaliacao & {
  processo: { numero_documento: string; ano_producao: number | null; assunto_processo: string | null; caixa: { numero: string } | null }
  avaliador: { nome: string } | null
}

export function ConfirmarEliminacoesPage() {
  const { profile, isCoord } = useAuth()
  const qc = useQueryClient()
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const hoje = startOfDay(new Date()).toISOString()

  const { data: pendentes, isLoading } = useQuery({
    queryKey: ['confirmar-eliminacoes', profile?.id, profile?.pilar_id, isCoord],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('*, processo:processo_id(numero_documento, ano_producao, assunto_processo, caixa:caixa_id(numero)), avaliador:avaliado_por(nome)')
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
