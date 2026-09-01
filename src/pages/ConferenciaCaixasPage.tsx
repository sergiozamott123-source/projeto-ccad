import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { Caixa, RequisicaoAvaliacao } from '@/lib/database.types'

type ProcessoConferencia = {
  id: string
  numero_documento: string
  assunto_processo: string | null
  avaliacoes: { decisao: string; status: string; ttd: { codigo: string; assunto: string } | null }[]
}

type CaixaConferencia = Caixa & {
  requisicoes_avaliacao: (RequisicaoAvaliacao & { avaliador: { nome: string } | null })[]
  processos: ProcessoConferencia[]
}

// Uma caixa entra na fila de conferência quando a requisição
// correspondente já está 'concluida' (todo processo avaliado) — o
// próprio banco já marca a caixa como 'aguardando_conferencia' nesse
// momento (trigger da Fase 14).
export function ConferenciaCaixasPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [numeroFinal, setNumeroFinal] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<Record<string, string>>({})

  const { data: caixas, isLoading } = useQuery({
    queryKey: ['caixas-aguardando-conferencia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caixas')
        .select(
          '*, requisicoes_avaliacao(*, avaliador:avaliador_id(nome)), processos(id, numero_documento, assunto_processo, avaliacoes(decisao, status, ttd:ttd_codigo_id(codigo, assunto)))',
        )
        .eq('status', 'aguardando_conferencia')
        .order('created_at', { ascending: true, referencedTable: 'requisicoes_avaliacao' })
      if (error) throw error
      return (data ?? []) as CaixaConferencia[]
    },
  })

  const { data: sugestoes } = useQuery({
    queryKey: ['numeros-sugeridos', (caixas ?? []).length],
    queryFn: async () => {
      const resultados: Record<string, string> = {}
      for (const c of caixas ?? []) {
        if (numeroFinal[c.id]) continue
        const { data } = await supabase.rpc('sugerir_numero_caixa_final')
        if (data) resultados[c.id] = data as string
      }
      return resultados
    },
    enabled: (caixas ?? []).length > 0,
  })

  useEffect(() => {
    if (!sugestoes) return
    setNumeroFinal(prev => ({ ...sugestoes, ...prev }))
  }, [sugestoes])

  const confirmar = useMutation({
    mutationFn: async (caixaId: string) => {
      const numero = (numeroFinal[caixaId] ?? '').trim()
      if (!numero || !profile) throw new Error('Informe o número da caixa no Arquivo Geral.')
      const { error } = await supabase
        .from('caixas')
        .update({ numero, status: 'arquivada', conferido_por: profile.id })
        .eq('id', caixaId)
      if (error) throw error
    },
    onSuccess: (_data, caixaId) => {
      qc.invalidateQueries({ queryKey: ['caixas-aguardando-conferencia'] })
      setErro(prev => ({ ...prev, [caixaId]: '' }))
    },
    onError: (e: any, caixaId) => {
      setErro(prev => ({ ...prev, [caixaId]: e?.message || 'Erro ao confirmar. Tente novamente.' }))
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conferência de Caixas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Caixas com a avaliação concluída, aguardando conferência do Protocolo antes de irem para o Arquivo Geral.
        </p>
      </div>

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : (caixas ?? []).length === 0 ? (
          <div className="text-center py-10">
            <PackageCheck size={36} className="text-teal-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma caixa aguardando conferência no momento.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(caixas ?? []).map(c => {
              const requisicao = c.requisicoes_avaliacao?.[0]
              const totalProcessos = c.processos?.length ?? 0
              const divergeQtd = c.quantidade_declarada != null && c.quantidade_declarada !== totalProcessos
              const aberta = abertaId === c.id

              return (
                <div key={c.id} className="py-4 px-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono font-semibold text-gray-900 text-sm">{c.numero}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{c.setor}</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Avaliado por {requisicao?.avaliador?.nome ?? '—'} · {totalProcessos} processo{totalProcessos === 1 ? '' : 's'}
                        {c.quantidade_declarada != null && ` (declarados: ${c.quantidade_declarada})`}
                        {requisicao?.concluida_em && ` · concluído em ${format(new Date(requisicao.concluida_em), 'dd/MM/yyyy HH:mm')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-700 text-xs font-medium inline-flex items-center gap-1 shrink-0"
                      onClick={() => setAbertaId(aberta ? null : c.id)}
                    >
                      {aberta ? <>Ver menos <ChevronUp size={12} /></> : <>Conferir códigos <ChevronDown size={12} /></>}
                    </button>
                  </div>

                  {divergeQtd && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle size={13} className="shrink-0" />
                      Quantidade declarada na entrada ({c.quantidade_declarada}) diferente da quantidade avaliada ({totalProcessos}).
                    </p>
                  )}

                  {aberta && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg divide-y divide-gray-200">
                      {(c.processos ?? []).map(p => {
                        const aval = p.avaliacoes?.[0]
                        return (
                          <div key={p.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-gray-800">{p.numero_documento}</span>
                              {p.assunto_processo && <span className="text-gray-500 ml-2 truncate">{p.assunto_processo}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-gray-700">{aval?.ttd?.codigo ?? '—'}</span>
                              <span
                                className={
                                  'px-2 py-0.5 rounded-full font-medium ' +
                                  (aval?.decisao?.toLowerCase().includes('elimin')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-teal-100 text-teal-700')
                                }
                              >
                                {aval?.decisao ?? '—'}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="label">Número da caixa no Arquivo Geral</label>
                      <input
                        className="input w-40 font-mono"
                        value={numeroFinal[c.id] ?? ''}
                        onChange={e => setNumeroFinal(prev => ({ ...prev, [c.id]: e.target.value }))}
                      />
                    </div>
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={!(numeroFinal[c.id] ?? '').trim() || confirmar.isPending}
                      onClick={() => confirmar.mutate(c.id)}
                    >
                      <PackageCheck size={13} /> Confirmar e arquivar
                    </button>
                    {erro[c.id] && <p className="text-xs text-red-600 w-full">{erro[c.id]}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
