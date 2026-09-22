import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, List, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { correspondeBusca } from '@/lib/textSearch'
import type { TtdCodigo } from '@/lib/database.types'
import clsx from 'clsx'

function isEliminacao(destino: string | null | undefined) {
  return !!destino && destino.toLowerCase().includes('elimin')
}

/**
 * Busca rápida de um código na Tabela de Temporalidade Documental (TTD),
 * para uso em qualquer tela que precise que alguém encontre/confira um
 * código — não só na avaliação em si. Carrega a tabela toda uma vez
 * (poucas centenas de linhas, cabe fácil em memória) e filtra no
 * navegador com a busca tolerante a acento/plural de `textSearch.ts`,
 * em vez de fazer uma consulta ao banco a cada letra digitada — por
 * isso é "rápida" de verdade, sem esperar rede a cada tecla.
 */
export function TtdCodigoPicker({
  value,
  onSelect,
  placeholder = 'Buscar código ou assunto na TTD…',
}: {
  value: TtdCodigo | null
  onSelect: (ttd: TtdCodigo) => void
  placeholder?: string
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [mostrarTabela, setMostrarTabela] = useState(false)
  const [filtroTabela, setFiltroTabela] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const { data: todos, isFetching } = useQuery({
    queryKey: ['ttd-codigos-picker'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .eq('status', 'vigente') // só código já em vigor pode ser escolhido — "proposta" ainda não foi aprovado
        .order('classe', { ascending: true })
        .order('codigo', { ascending: true })
      return (data ?? []) as TtdCodigo[]
    },
    staleTime: 1000 * 60 * 10,
  })

  const resultados = useMemo(() => {
    const termo = busca.trim()
    if (termo.length < 2) return []
    return (todos ?? [])
      .filter(t => correspondeBusca(`${t.codigo} ${t.serie} ${t.assunto}`, termo))
      .slice(0, 8)
  }, [todos, busca])

  const gruposTabela = useMemo(() => {
    const termo = filtroTabela.trim()
    const itens = (todos ?? []).filter(t => !termo || correspondeBusca(`${t.codigo} ${t.classe} ${t.serie} ${t.assunto}`, termo))
    const map = new Map<string, TtdCodigo[]>()
    for (const t of itens) {
      const chave = t.classe?.trim() || 'Sem classe definida'
      if (!map.has(chave)) map.set(chave, [])
      map.get(chave)!.push(t)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [todos, filtroTabela])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function escolher(ttd: TtdCodigo) {
    onSelect(ttd)
    setBusca('')
    setAberto(false)
    setMostrarTabela(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-8 text-sm"
          placeholder={placeholder}
          value={busca}
          onChange={e => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
        />
        {isFetching && !todos && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-300">carregando…</span>
        )}
      </div>

      {busca.length > 0 && busca.length < 2 && (
        <p className="text-xs text-gray-400 mt-1">Digite ao menos 2 letras para buscar.</p>
      )}

      {aberto && busca.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {resultados.length > 0 ? (
            resultados.map(ttd => (
              <button
                key={ttd.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-xs"
                onClick={() => escolher(ttd)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-teal-600">{ttd.codigo}</span>
                  <span className="text-gray-700">{ttd.assunto}</span>
                </div>
                <span className={clsx('text-[11px] font-medium', isEliminacao(ttd.destinacao_final) ? 'text-red-500' : 'text-teal-600')}>
                  {ttd.destinacao_final || '—'}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-gray-400">Nenhum código encontrado para "{busca}".</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setFiltroTabela(''); setMostrarTabela(true) }}
        className="text-xs text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 mt-1.5"
      >
        <List size={12} /> Não achou? Navegue pela tabela completa da TTD
      </button>

      {value && (
        <div className="mt-2.5 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-gray-500">Código escolhido</span>
            <span className="font-mono font-semibold text-gray-800">{value.codigo}</span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-gray-500">Destinação final</span>
            <span className={clsx('font-semibold', isEliminacao(value.destinacao_final) ? 'text-red-600' : 'text-teal-700')}>
              {value.destinacao_final || '—'}
            </span>
          </div>
          {(value.classe || value.serie) && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-gray-500">Classe/Série</span>
              <span className="text-gray-700 text-right">{[value.classe, value.serie].filter(Boolean).join(' / ')}</span>
            </div>
          )}
        </div>
      )}

      {mostrarTabela && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMostrarTabela(false)} />
          <div className="relative w-full sm:w-[480px] bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Tabela de Temporalidade (TTD) completa</h3>
                <p className="text-xs text-gray-400 mt-0.5">Navegue por classe e clique no código que se aplica.</p>
              </div>
              <button onClick={() => setMostrarTabela(false)} className="text-gray-400 hover:text-gray-700 shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 py-2 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-8 text-sm"
                  placeholder="Filtrar por código, classe, série ou assunto…"
                  value={filtroTabela}
                  onChange={e => setFiltroTabela(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {!todos ? (
                <p className="text-sm text-gray-400 py-6 text-center">Carregando tabela…</p>
              ) : gruposTabela.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhum código encontrado para esse filtro.</p>
              ) : (
                gruposTabela.map(([classe, itens]) => (
                  <div key={classe} className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 sticky top-0 bg-white py-1">
                      {classe} <span className="font-normal normal-case text-gray-400">· {itens.length} código{itens.length === 1 ? '' : 's'}</span>
                    </p>
                    <div className="space-y-1">
                      {itens.map(ttd => (
                        <button
                          key={ttd.id}
                          type="button"
                          onClick={() => escolher(ttd)}
                          className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-teal-600">{ttd.codigo}</span>
                            <span className="text-gray-700">{ttd.assunto}</span>
                          </div>
                          <div className="text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            {ttd.serie && <span>Série: {ttd.serie}</span>}
                            <span className={clsx('font-medium', isEliminacao(ttd.destinacao_final) ? 'text-red-500' : 'text-teal-600')}>
                              {ttd.destinacao_final || '—'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
