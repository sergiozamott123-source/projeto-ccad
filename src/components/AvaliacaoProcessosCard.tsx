import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, ArrowRight, Clock, List, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfDay } from 'date-fns'
import type { Processo, TtdCodigo, Avaliacao, RequisicaoAvaliacao } from '@/lib/database.types'
import clsx from 'clsx'

// Uma avaliação já "resolve" o processo (não precisa mais avaliar) se ela
// ainda está válida — aguardando confirmação ou já confirmada. Se a única
// avaliação existente foi devolvida, o processo volta para a fila.
const STATUS_RESOLVE: Avaliacao['status'][] = ['confirmada', 'aguardando_confirmacao']

function isEliminacao(destino: string | null | undefined) {
  return !!destino && destino.toLowerCase().includes('elimin')
}

export function AvaliacaoProcessosCard() {
  const { profile, isCoord } = useAuth()
  const qc = useQueryClient()
  const [caixaNumero, setCaixaNumero] = useState('')
  const [caixaBusca, setCaixaBusca] = useState('') // valor efetivamente pesquisado

  // Quem não é Coordenação só pode avaliar caixas que constam numa
  // requisição pendente enviada a ele — não busca mais livremente.
  const { data: minhasRequisicoes } = useQuery({
    queryKey: ['minhas-requisicoes-pendentes', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('requisicoes_avaliacao')
        .select('*, caixa:caixa_id(numero), criador:criado_por(nome)')
        .eq('avaliador_id', profile!.id)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
      return (data ?? []) as (RequisicaoAvaliacao & { caixa: { numero: string } | null; criador: { nome: string } | null })[]
    },
    enabled: !!profile?.id && !isCoord,
  })
  const [ttdSearch, setTtdSearch] = useState('')
  const [selectedTtd, setSelectedTtd] = useState<TtdCodigo | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Navegador da TTD completa — para quando a busca por palavra não acha
  // nada, porque o assunto na etiqueta do processo não bate com o texto
  // oficial da tabela (comum em processos antigos, sem padrão de escrita).
  const [mostrarTabela, setMostrarTabela] = useState(false)
  const [filtroTabela, setFiltroTabela] = useState('')

  const { data: ttdTodos, isFetching: carregandoTtdTodos } = useQuery({
    queryKey: ['ttd-todos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .eq('status', 'vigente') // só código já em vigor pode classificar processo — "proposta" ainda não foi aprovado
        .order('classe', { ascending: true })
        .order('codigo', { ascending: true })
      return (data ?? []) as TtdCodigo[]
    },
    enabled: mostrarTabela,
    staleTime: 1000 * 60 * 10,
  })

  const gruposTabela = useMemo(() => {
    const termo = filtroTabela.trim().toLowerCase()
    const itens = (ttdTodos ?? []).filter(t =>
      !termo ||
      t.codigo?.toLowerCase().includes(termo) ||
      t.assunto?.toLowerCase().includes(termo) ||
      t.classe?.toLowerCase().includes(termo) ||
      t.serie?.toLowerCase().includes(termo),
    )
    const map = new Map<string, TtdCodigo[]>()
    for (const t of itens) {
      const chave = t.classe?.trim() || 'Sem classe definida'
      if (!map.has(chave)) map.set(chave, [])
      map.get(chave)!.push(t)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [ttdTodos, filtroTabela])

  function escolherTtd(ttd: TtdCodigo) {
    setSelectedTtd(ttd)
    setTtdSearch(`${ttd.codigo} — ${ttd.assunto}`)
    setShowDropdown(false)
    setMostrarTabela(false)
  }

  const hoje = startOfDay(new Date()).toISOString()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: caixaInfo, isFetching: buscandoCaixa } = useQuery({
    queryKey: ['avaliacao-caixa', caixaBusca],
    queryFn: async () => {
      const { data: caixa } = await supabase.from('caixas').select('id, numero, setor').eq('numero', caixaBusca).maybeSingle()
      if (!caixa) return { caixa: null, processos: [] as Processo[] }

      const { data: processos } = await supabase
        .from('processos')
        .select('*, ttd:ttd_codigo_id(*)')
        .eq('caixa_id', caixa.id)
        .order('created_at', { ascending: true })

      const ids = (processos ?? []).map(p => p.id)
      let resolvidos = new Set<string>()
      if (ids.length > 0) {
        const { data: avals } = await supabase
          .from('avaliacoes')
          .select('processo_id, status')
          .in('processo_id', ids)
          .in('status', STATUS_RESOLVE)
        resolvidos = new Set((avals ?? []).map(a => a.processo_id))
      }

      return { caixa, processos: (processos ?? []) as Processo[], resolvidos }
    },
    enabled: caixaBusca.length > 0,
  })

  const processos = caixaInfo?.processos ?? []
  const resolvidos = caixaInfo?.resolvidos ?? new Set<string>()
  const pendentes = processos.filter(p => !resolvidos.has(p.id))
  const atual = pendentes[0] ?? null
  const totalNaCaixa = processos.length
  const posicaoAtual = totalNaCaixa - pendentes.length + 1

  // Última devolução (se houver) do processo atual, para mostrar o motivo ao avaliador
  const { data: devolucao } = useQuery({
    queryKey: ['avaliacao-devolucao', atual?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('avaliacoes')
        .select('motivo_devolucao, created_at')
        .eq('processo_id', atual!.id)
        .eq('status', 'devolvida')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!atual?.id,
  })

  useEffect(() => {
    if (atual?.ttd) {
      setSelectedTtd(atual.ttd)
      setTtdSearch(`${atual.ttd.codigo} — ${atual.ttd.assunto}`)
    } else {
      setSelectedTtd(null)
      setTtdSearch('')
    }
  }, [atual?.id])

  const { data: ttdResults } = useQuery({
    queryKey: ['ttd-search-avaliacao', ttdSearch],
    queryFn: async () => {
      if (ttdSearch.length < 2) return []
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .or(`codigo.ilike.%${ttdSearch}%,assunto.ilike.%${ttdSearch}%`)
        .eq('status', 'vigente') // só código já em vigor pode classificar processo — "proposta" ainda não foi aprovado
        .limit(10)
      return (data ?? []) as TtdCodigo[]
    },
    enabled: ttdSearch.length >= 2 && ttdSearch !== `${selectedTtd?.codigo} — ${selectedTtd?.assunto}`,
  })

  const { data: avaliadosHoje } = useQuery({
    queryKey: ['minhas-avaliacoes-hoje', profile?.id, hoje],
    queryFn: async () => {
      const { data } = await supabase
        .from('avaliacoes')
        .select('*, processo:processo_id(numero_documento)')
        .eq('avaliado_por', profile!.id)
        .gte('created_at', hoje)
        .order('created_at', { ascending: false })
        .limit(5)
      return (data ?? []) as (Avaliacao & { processo: { numero_documento: string } })[]
    },
    enabled: !!profile?.id,
  })

  const { data: totalHojeCount } = useQuery({
    queryKey: ['minhas-avaliacoes-hoje-count', profile?.id, hoje],
    queryFn: async () => {
      const { count } = await supabase
        .from('avaliacoes')
        .select('*', { count: 'exact', head: true })
        .eq('avaliado_por', profile!.id)
        .gte('created_at', hoje)
      return count ?? 0
    },
    enabled: !!profile?.id,
  })

  const salvar = useMutation({
    mutationFn: async () => {
      if (!atual || !selectedTtd || !profile) return
      if (atual.ttd_codigo_id !== selectedTtd.id) {
        const { error: e1 } = await supabase
          .from('processos')
          .update({ ttd_codigo_id: selectedTtd.id, requer_revisao_manual: false })
          .eq('id', atual.id)
        if (e1) throw e1
      }
      const { error: e2 } = await supabase.from('avaliacoes').insert({
        processo_id: atual.id,
        avaliado_por: profile.id,
        decisao: selectedTtd.destinacao_final,
        pilar_id: profile.pilar_id,
      })
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avaliacao-caixa', caixaBusca] })
      qc.invalidateQueries({ queryKey: ['minhas-avaliacoes-hoje'] })
      qc.invalidateQueries({ queryKey: ['minhas-avaliacoes-hoje-count'] })
      qc.invalidateQueries({ queryKey: ['minhas-requisicoes-pendentes'] })
      setSelectedTtd(null)
      setTtdSearch('')
    },
  })

  function buscarCaixa() {
    setCaixaBusca(caixaNumero.trim())
  }

  const statusLabel: Record<Avaliacao['status'], { label: string; style: string }> = {
    aguardando_confirmacao: { label: 'Aguardando confirmação', style: 'bg-amber-100 text-amber-700' },
    confirmada: { label: 'Confirmada', style: 'bg-teal-100 text-teal-700' },
    devolvida: { label: 'Devolvida', style: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">Avaliação de Processos</h2>
        <div className="flex items-center gap-2">
          {caixaInfo?.caixa && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
              Caixa {caixaInfo.caixa.numero} · {totalNaCaixa > 0 ? `${Math.min(posicaoAtual, totalNaCaixa)} de ${totalNaCaixa}` : '0'}
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-600 font-medium">
            {totalHojeCount ?? 0} hoje
          </span>
        </div>
      </div>

      {/* Selecionar caixa: Coordenação busca livremente; os demais só
          veem as caixas que foram enviadas a eles numa requisição */}
      {isCoord ? (
        <div className="flex gap-2 mb-4">
          <input
            className="input max-w-[220px]"
            placeholder="Nº da caixa a avaliar…"
            value={caixaNumero}
            onChange={e => setCaixaNumero(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarCaixa()}
          />
          <button className="btn-secondary text-sm" onClick={buscarCaixa} disabled={!caixaNumero.trim()}>
            <Search size={14} /> Buscar
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <label className="label">Requisições pendentes para você</label>
          {(minhasRequisicoes ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">
              Nenhuma requisição pendente no momento. Aguarde a Coordenação enviar uma caixa para você avaliar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(minhasRequisicoes ?? []).map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setCaixaBusca(r.caixa?.numero ?? '')}
                  className={clsx(
                    'text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                    caixaBusca === r.caixa?.numero
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-teal-400',
                  )}
                >
                  Caixa {r.caixa?.numero ?? '—'} · enviada por {r.criador?.nome?.split(' ')[0] ?? '—'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {caixaBusca && buscandoCaixa && (
        <p className="text-sm text-gray-400 py-4">Buscando…</p>
      )}

      {caixaBusca && !buscandoCaixa && !caixaInfo?.caixa && (
        <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
          Caixa {caixaBusca} não encontrada. Confira o número ou catalogue os processos dela primeiro.
        </p>
      )}

      {caixaInfo?.caixa && totalNaCaixa === 0 && (
        <p className="text-sm text-gray-400 py-4">Essa caixa ainda não tem processos catalogados.</p>
      )}

      {caixaInfo?.caixa && totalNaCaixa > 0 && !atual && (
        <p className="text-sm text-teal-700 bg-teal-50 rounded-lg px-3 py-2.5">
          Todos os {totalNaCaixa} processos da Caixa {caixaInfo.caixa.numero} já foram avaliados. 🎉
        </p>
      )}

      {atual && (
        <div className="mb-4">
          {devolucao && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
              <strong>Devolvido pelo Responsável do Eixo:</strong> {devolucao.motivo_devolucao}
            </div>
          )}
          {/* O que é o processo: número, ano, interessado e — o mais
              importante para escolher a classificação — o assunto. */}
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-1.5">
              <span>
                Processo <strong className="font-mono text-gray-800">{atual.numero_documento}</strong>
                {' '}· {atual.ano_producao ?? '—'}{atual.ano_producao_complemento ?? ''}
              </span>
              {atual.interessado && (
                <span>Interessado: <strong className="text-gray-800">{atual.interessado}</strong></span>
              )}
            </div>
            <p className="text-sm text-gray-800 leading-relaxed">
              {atual.assunto_processo || 'Este processo não tem assunto cadastrado — confira o documento físico antes de classificar.'}
            </p>
          </div>

          <div ref={dropdownRef} className="relative mb-1">
            <label className="label">Classificação (Tabela de Temporalidade de Documentos — TTD)</label>
            <p className="text-xs text-gray-400 mb-1.5">
              Leia o assunto acima e busque, abaixo, o código correspondente: digite parte do código (ex.: 020.1) ou uma palavra do assunto (ex.: convênio).
            </p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8 text-sm"
                placeholder="Buscar código ou assunto na TTD…"
                value={ttdSearch}
                onChange={e => { setTtdSearch(e.target.value); setShowDropdown(true); if (!e.target.value) setSelectedTtd(null) }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>
            {ttdSearch.length > 0 && ttdSearch.length < 2 && (
              <p className="text-xs text-gray-400 mt-1">Digite ao menos 2 letras para buscar.</p>
            )}
            {showDropdown && ttdSearch.length >= 2 && ttdSearch !== `${selectedTtd?.codigo} — ${selectedTtd?.assunto}` && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {(ttdResults ?? []).length > 0 ? (
                  (ttdResults ?? []).map(ttd => (
                    <button
                      key={ttd.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-xs"
                      onClick={() => escolherTtd(ttd)}
                    >
                      <span className="font-mono font-semibold text-teal-600">{ttd.codigo}</span> — {ttd.assunto}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-xs text-gray-400">
                    Nenhum código encontrado para "{ttdSearch}".
                  </p>
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
          </div>

          {selectedTtd && (
            <div className="mt-3 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 text-xs space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500">Destinação final:</span>
                <span className={clsx('font-semibold', isEliminacao(selectedTtd.destinacao_final) ? 'text-red-600' : 'text-teal-700')}>
                  {selectedTtd.destinacao_final || '—'}
                </span>
              </div>
              {(selectedTtd.classe || selectedTtd.serie) && (
                <div className="text-gray-500">
                  Classe/Série: <span className="text-gray-700">{[selectedTtd.classe, selectedTtd.serie].filter(Boolean).join(' / ')}</span>
                </div>
              )}
              {selectedTtd.fase_corrente && (
                <div className="text-gray-500">Fase corrente: <span className="text-gray-700">{selectedTtd.fase_corrente}</span></div>
              )}
            </div>
          )}
          {selectedTtd && isEliminacao(selectedTtd.destinacao_final) && (
            <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
              <Clock size={12} />
              Como é Eliminação, esta avaliação vai para conferência do Responsável do Eixo antes de valer.
            </p>
          )}
          {salvar.isError && (
            <p className="mt-2 text-xs text-red-600">Erro ao salvar a avaliação. Tente novamente.</p>
          )}

          <button
            className="btn-primary text-sm mt-3 w-full sm:w-auto"
            disabled={!selectedTtd || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar e avaliar próximo'} <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Mini-histórico */}
      {(avaliadosHoje ?? []).length > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-2">
          <p className="text-xs font-medium text-gray-500 mb-2">Avaliados recentemente</p>
          <div className="space-y-1.5">
            {(avaliadosHoje ?? []).map(a => (
              <div key={a.id} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-gray-500 w-20 shrink-0">{a.processo?.numero_documento}</span>
                <span className={clsx('font-medium w-32 shrink-0', isEliminacao(a.decisao) ? 'text-red-600' : 'text-teal-700')}>
                  {a.decisao}
                </span>
                <span className={clsx('px-2 py-0.5 rounded-full font-medium shrink-0', statusLabel[a.status].style)}>
                  {statusLabel[a.status].label}
                </span>
                <span className="text-gray-400 ml-auto shrink-0">{format(new Date(a.created_at), 'HH:mm')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navegador da tabela TTD completa, para quando a busca por
          palavra não encontra nada (assunto do processo antigo, sem
          padrão, não bate com o texto oficial da tabela). */}
      {mostrarTabela && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMostrarTabela(false)} />
          <div className="relative w-full sm:w-[480px] bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Tabela de Temporalidade (TTD) completa</h3>
                <p className="text-xs text-gray-400 mt-0.5">Navegue por classe e clique no código que mais se aplica.</p>
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
              {carregandoTtdTodos ? (
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
                          onClick={() => escolherTtd(ttd)}
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
