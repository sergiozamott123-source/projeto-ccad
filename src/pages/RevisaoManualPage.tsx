import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Processo, TtdCodigo } from '@/lib/database.types'
import { correspondeBusca } from '@/lib/textSearch'

// Busca/seleção de um código TTD vigente — reaproveitada tanto na
// classificação de um processo por vez quanto na classificação em lote
// (várias caixas de "Avulsos" recebem sempre o mesmo código, então repetir
// esse fluxo processo a processo era um retrabalho grande para o Sérgio).
function TtdBusca({
  ttdTodos,
  value,
  onChange,
  selected,
  onSelect,
}: {
  ttdTodos: TtdCodigo[] | undefined
  value: string
  onChange: (v: string) => void
  selected: TtdCodigo | null
  onSelect: (t: TtdCodigo | null) => void
}) {
  const results = value.length >= 2
    ? (ttdTodos ?? []).filter(t => correspondeBusca(`${t.codigo} ${t.assunto}`, value)).slice(0, 8)
    : []

  return (
    <div className="space-y-2">
      <input
        className="input text-sm"
        placeholder="Buscar código TTD…"
        value={value}
        onChange={e => { onChange(e.target.value); onSelect(null) }}
      />
      {results.length > 0 && !selected && (
        <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
          {results.map(t => (
            <button
              key={t.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-xs"
              onClick={() => { onSelect(t); onChange(`${t.codigo} — ${t.assunto}`) }}
            >
              <span className="font-mono font-semibold text-teal-600">{t.codigo}</span>
              {' '}— {t.assunto}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="bg-gray-50 rounded-lg p-2 text-xs grid grid-cols-3 gap-2">
          <div><span className="text-gray-400">Corrente:</span> {selected.fase_corrente}</div>
          <div><span className="text-gray-400">Interm.:</span> {selected.fase_intermediaria}</div>
          <div className={selected.destinacao_final?.toLowerCase().includes('elimin') ? 'text-red-600' : 'text-teal-700'}>
            <span className="text-gray-400">Destinação:</span> {selected.destinacao_final}
          </div>
        </div>
      )}
    </div>
  )
}

export function RevisaoManualPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [ttdSearch, setTtdSearch] = useState('')
  const [selectedTtd, setSelectedTtd] = useState<TtdCodigo | null>(null)

  // Seleção em lote — um conjunto de ids de processo marcados na fila.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [ttdSearchLote, setTtdSearchLote] = useState('')
  const [selectedTtdLote, setSelectedTtdLote] = useState<TtdCodigo | null>(null)

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

  // Busca a tabela vigente inteira uma única vez e filtra no navegador —
  // isso permite uma busca tolerante a acento e à ordem das palavras
  // (ver src/lib/textSearch.ts), o que a busca "ilike" direto no banco
  // não conseguia fazer (por isso vários assuntos conhecidos não
  // apareciam nas buscas).
  const { data: ttdTodos } = useQuery({
    queryKey: ['ttd-codigos-vigentes-revisao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ttd_codigos')
        .select('id, codigo, assunto, serie, fase_corrente, fase_intermediaria, destinacao_final, status')
        .eq('status', 'vigente')
        .order('codigo')
      return (data ?? []) as TtdCodigo[]
    },
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

  const classifyLote = useMutation({
    mutationFn: async ({ ids, ttdId }: { ids: string[]; ttdId: string }) => {
      const { error } = await supabase
        .from('processos')
        .update({ ttd_codigo_id: ttdId, requer_revisao_manual: false } as Partial<Processo>)
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revisao-manual'] })
      qc.invalidateQueries({ queryKey: ['acervo-stats'] })
      setSelecionados(new Set())
      setTtdSearchLote('')
      setSelectedTtdLote(null)
    },
  })

  const filtered = (processos ?? []).filter(p =>
    !search
    || p.numero_documento?.toLowerCase().includes(search.toLowerCase())
    || p.interessado?.toLowerCase().includes(search.toLowerCase())
    || p.assunto_processo?.toLowerCase().includes(search.toLowerCase())
  )

  const todosFiltradosSelecionados = filtered.length > 0 && filtered.every(p => selecionados.has(p.id))

  function alternarSelecao(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function alternarSelecionarTodosFiltrados(marcar: boolean) {
    setSelecionados(prev => {
      const next = new Set(prev)
      for (const p of filtered) {
        if (marcar) next.add(p.id)
        else next.delete(p.id)
      }
      return next
    })
  }

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

      {/* Barra de classificação em lote — aparece assim que algum processo é marcado */}
      {selecionados.size > 0 && (
        <div className="card p-4 bg-teal-50 border border-teal-200 space-y-3 sticky top-2 z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-teal-900">
              {selecionados.size} processo(s) selecionado(s) para receber o mesmo código
            </p>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline shrink-0"
              onClick={() => setSelecionados(new Set())}
            >
              Limpar seleção
            </button>
          </div>
          <TtdBusca
            ttdTodos={ttdTodos}
            value={ttdSearchLote}
            onChange={setTtdSearchLote}
            selected={selectedTtdLote}
            onSelect={setSelectedTtdLote}
          />
          <button
            className="btn-primary text-sm"
            disabled={!selectedTtdLote || classifyLote.isPending}
            onClick={() => classifyLote.mutate({ ids: Array.from(selecionados), ttdId: selectedTtdLote!.id })}
          >
            {classifyLote.isPending
              ? 'Classificando…'
              : `Classificar ${selecionados.size} processo(s) com este código`}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-2" />
          <p className="text-gray-500">Fila de revisão vazia. Todos os processos estão classificados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-500 px-1">
            <input
              type="checkbox"
              checked={todosFiltradosSelecionados}
              onChange={e => alternarSelecionarTodosFiltrados(e.target.checked)}
            />
            Selecionar todos os {filtered.length} processo(s) {search ? 'filtrado(s)' : 'da fila'}
          </label>

          {filtered.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={selecionados.has(p.id)}
                  onChange={() => alternarSelecao(p.id)}
                  aria-label={`Selecionar processo ${p.numero_documento ?? p.id}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertCircle size={14} className="text-orange-500 shrink-0" />
                    <span className="font-mono text-sm font-semibold text-gray-900">{p.numero_documento}</span>
                    {p.caixa && (
                      <span className="text-xs text-gray-400">
                        Caixa: {(p.caixa as { numero: string }).numero}
                        {(p.setor_origem ?? (p.caixa as { setor: string | null }).setor) && ` | ${p.setor_origem ?? (p.caixa as { setor: string | null }).setor}`}
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

                  {/* Inline TTD assignment (classificação individual) */}
                  {assigning === p.id && (
                    <div className="mt-3 space-y-2">
                      <TtdBusca
                        ttdTodos={ttdTodos}
                        value={ttdSearch}
                        onChange={setTtdSearch}
                        selected={selectedTtd}
                        onSelect={setSelectedTtd}
                      />
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
