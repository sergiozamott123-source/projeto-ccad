import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Processo, TtdCodigo } from '@/lib/database.types'
export function RevisaoManualPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [ttdSearch, setTtdSearch] = useState('')
  const [selectedTtd, setSelectedTtd] = useState<TtdCodigo | null>(null)

  const { data: processos, isLoading } = useQuery({
    queryKey: ['revisao-manual'],
    queryFn: async () => {
      const { data } = await supabase
        .from('processos')
        .select('*, caixa:caixa_id(numero, setor)')
        .eq('requer_revisao_manual', true)
        .order('created_at', { ascending: false })
      return (data ?? []) as Processo[]
    },
  })

  const { data: ttdResults } = useQuery({
    queryKey: ['ttd-search-revisao', ttdSearch],
    queryFn: async () => {
      if (ttdSearch.length < 2) return []
      const { data } = await supabase
        .from('ttd_codigos')
        .select('id, codigo, assunto, fase_corrente, fase_intermediaria, destinacao_final, status')
        .or(`codigo.ilike.%${ttdSearch}%,assunto.ilike.%${ttdSearch}%`)
        .eq('status', 'vigente')
        .limit(8)
      return (data ?? []) as TtdCodigo[]
    },
    enabled: ttdSearch.length >= 2,
  })

  const classify = useMutation({
    mutationFn: async ({ processoId, ttdId }: { processoId: string; ttdId: string }) => {
      const { error } = await supabase
        .from('processos')
        .update({ ttd_codigo_id: ttdId, requer_revisao_manual: false } as Partial<Processo>)
        .eq('id', processoId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revisao-manual'] })
      qc.invalidateQueries({ queryKey: ['acervo-stats'] })
      setAssigning(null)
      setTtdSearch('')
      setSelectedTtd(null)
    },
  })

  const filtered = (processos ?? []).filter(p =>
    !search
    || p.numero_documento?.toLowerCase().includes(search.toLowerCase())
    || p.interessado?.toLowerCase().includes(search.toLowerCase())
    || p.assunto_processo?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fila de Revisão Manual</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {(processos ?? []).length} processo(s) aguardando classificação na TTD.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Buscar por nº do documento, interessado ou assunto…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-2" />
          <p className="text-gray-500">Fila de revisão vazia. Todos os processos estão classificados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertCircle size={14} className="text-orange-500 shrink-0" />
                    <span className="font-mono text-sm font-semibold text-gray-900">{p.numero_documento}</span>
                    {p.caixa && (
                      <span className="text-xs text-gray-400">
                        Caixa: {(p.caixa as { numero: string }).numero} | {(p.caixa as { setor: string }).setor}
                      </span>
                    )}
                    {p.ano_producao && (
                      <span className="text-xs text-gray-400">Ano: {p.ano_producao}</span>
                    )}
                  </div>
                  {p.interessado && (
                    <p className="text-sm text-gray-600 mt-1">{p.interessado}</p>
                  )}
                  {p.assunto_processo && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.assunto_processo}</p>
                  )}

                  {/* Inline TTD assignment */}
                  {assigning === p.id && (
                    <div className="mt-3 space-y-2">
                      <input
                        className="input text-sm"
                        placeholder="Buscar código TTD…"
                        value={ttdSearch}
                        onChange={e => { setTtdSearch(e.target.value); setSelectedTtd(null) }}
                      />
                      {(ttdResults ?? []).length > 0 && !selectedTtd && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                          {(ttdResults ?? []).map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-xs"
                              onClick={() => { setSelectedTtd(t); setTtdSearch(`${t.codigo} — ${t.assunto}`) }}
                            >
                              <span className="font-mono font-semibold text-teal-600">{t.codigo}</span>
                              {' '}— {t.assunto}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedTtd && (
                        <div className="bg-gray-50 rounded-lg p-2 text-xs grid grid-cols-3 gap-2">
                          <div><span className="text-gray-400">Corrente:</span> {selectedTtd.fase_corrente}</div>
                          <div><span className="text-gray-400">Interm.:</span> {selectedTtd.fase_intermediaria}</div>
                          <div className={selectedTtd.destinacao_final?.toLowerCase().includes('elimin') ? 'text-red-600' : 'text-teal-700'}>
                            <span className="text-gray-400">Destinação:</span> {selectedTtd.destinacao_final}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="btn-primary text-xs py-1.5"
                          disabled={!selectedTtd || classify.isPending}
                          onClick={() => classify.mutate({ processoId: p.id, ttdId: selectedTtd!.id })}
                        >
                          Classificar
                        </button>
                        <button
                          className="btn-secondary text-xs py-1.5"
                          onClick={() => { setAssigning(null); setTtdSearch(''); setSelectedTtd(null) }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {assigning !== p.id && (
                  <button
                    className="btn-primary text-xs py-1.5 px-3 shrink-0"
                    onClick={() => setAssigning(p.id)}
                  >
                    Classificar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
