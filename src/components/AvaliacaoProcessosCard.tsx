import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, ArrowRight, Clock, List, X, Check, CheckCircle2 } from 'lucide-react'
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
  const [toast, setToast] = useState<string | null>(null)

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

  // Some sozinho depois de alguns segundos — não precisa de botão de fechar.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const { data: caixaInfo, isFetching: buscandoCaixa } = useQuery({
    queryKey: ['avaliacao-caixa', caixaBusca],
    queryFn: async () => {
      const { data: caixa } = await supabase.from('caixas').select('id, numero, setor').eq('numero', caixaBusca).maybeSingle()
      if (!caixa) return { caixa: null, processos: [] as Processo[], decisoes: new Map<string, string | null>() }

      const { data: processos } = await supabase
        .from('processos')
        .select('*, ttd:ttd_codigo_id(*)')
        .eq('caixa_id', caixa.id)
        .order('created_at', { ascending: true })

      const ids = (processos ?? []).map(p => p.id)
      // Para cada processo já resolvido, guardamos também a decisão (Eliminação/
      // Guarda Permanente) — usada na lista de acompanhamento da caixa.
      const decisoes = new Map<string, string | null>()
      if (ids.length > 0) {
        const { data: avals } = await supabase
          .from('avaliacoes')
          .select('processo_id, status, decisao')
          .in('processo_id', ids)
          .in('status', STATUS_RESOLVE)
        for (const a of avals ?? []) decisoes.set(a.processo_id, a.decisao)
      }

      return { caixa, processos: (processos ?? []) as Processo[], decisoes }
    },
    enabled: caixaBusca.length > 0,
  })

  const processos = caixaInfo?.processos ?? []
  const decisoes = caixaInfo?.decisoes ?? new Map<string, string | null>()
  const pendentes = processos.filter(p => !decisoes.has(p.id))
  const atual = pendentes[0] ?? null
  const totalNaCaixa = processos.length
  const concluidosNaCaixa = totalNaCaixa - pendentes.length
  const posicaoAtual = concluidosNaCaixa + 1
  const progressoPct = totalNaCaixa > 0 ? Math.round((concluidosNaCaixa / totalNaCaixa) * 100) : 0

  const resumoCaixa = useMemo(() => {
    let elim = 0
    let perm = 0
    for (const d of decisoes.values()) {
      if (isEliminacao(d)) elim++
      else perm++
    }
    return { elim, perm }
  }, [decisoes])

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
      if (!atual || !selectedTtd || !profile) return null
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
      return { numero: atual.numero_documento, decisao: selectedTtd.destinacao_final }
    },
    onSuccess: (resultado) => {
      qc.invalidateQueries({ queryKey: ['avaliacao-caixa', caixaBusca] })
      qc.invalidateQueries({ queryKey: ['minhas-avaliacoes-hoje'] })
      qc.invalidateQueries({ queryKey: ['minhas-avaliacoes-hoje-count'] })
      qc.invalidateQueries({ queryKey: ['minhas-requisicoes-pendentes'] })
      setSelectedTtd(null)
      setTtdSearch('')
      if (resultado) {
        setToast(`Avaliação salva — processo ${resultado.numero} classificado como ${resultado.decisao || '—'}.`)
      }
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
    <div className="card p-5 relative">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900">Avaliação de Processos</h2>
        <div className="flex items-center gap-2">
          {caixaInfo?.caixa && totalNaCaixa > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-semibold">
              Processo {Math.min(posicaoAtual, totalNaCaixa)} de {totalNaCaixa}
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
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

      {/* Barra de progresso da caixa — sempre visível enquanto há uma
          caixa carregada, para o avaliador nunca se sentir perdido no
          meio da tarefa. */}
      {caixaInfo?.caixa && totalNaCaixa > 0 && (
        <div className="mb-4">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${atual ? progressoPct : 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Tela de conclusão da caixa */}
      {caixaInfo?.caixa && totalNaCaixa > 0 && !atual && (
        <div className="text-center py-6 mb-2">
          <div className="w-14 h-14 rounded-full bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={26} />
          </div>
          <p className="font-semibold text-gray-900 mb-1">Caixa {caixaInfo.caixa.numero} concluída!</p>
          <p className="text-sm text-gray-500 mb-4">Você avaliou todos os {totalNaCaixa} processos desta caixa.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 min-w-[6.5rem]">
              <p className="text-lg font-bold text-gray-900">{totalNaCaixa}</p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Avaliados</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 min-w-[6.5rem]">
              <p className="text-lg font-bold text-red-600">{resumoCaixa.elim}</p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Eliminação</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 min-w-[6.5rem]">
              <p className="text-lg font-bold text-teal-600">{resumoCaixa.perm}</p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Guarda Perm.</p>
            </div>
          </div>
        </div>
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
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
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

          {/* Passo 1 — encontrar o código */}
          <div className="flex items-start gap-3">
            <span
              className={clsx(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border mt-0.5 transition-colors',
                selectedTtd ? 'bg-teal-50 border-teal-200 text-teal-600' : 'bg-teal-500 border-teal-500 text-white',
              )}
            >
              {selectedTtd ? <Check size={14} /> : 1}
            </span>
            <div className="flex-1 min-w-0" ref={dropdownRef}>
              <p className="font-semibold text-gray-900 text-sm mb-0.5">Encontre o código na Tabela de Temporalidade (TTD)</p>
              <p className="text-xs text-gray-400 mb-2">
                Digite parte do código (ex.: 020.1) ou uma palavra do assunto acima (ex.: convênio).
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
              </div>
              <button
                type="button"
                onClick={() => { setFiltroTabela(''); setMostrarTabela(true) }}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1 mt-1.5"
              >
                <List size={12} /> Não achou? Navegue pela tabela completa da TTD
              </button>

              {selectedTtd && (
                <div className="mt-3 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-gray-500">Código escolhido</span>
                    <span className="font-mono font-semibold text-gray-800">{selectedTtd.codigo}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-gray-500">Destinação final</span>
                    <span className={clsx('font-semibold', isEliminacao(selectedTtd.destinacao_final) ? 'text-red-600' : 'text-teal-700')}>
                      {selectedTtd.destinacao_final || '—'}
                    </span>
                  </div>
                  {(selectedTtd.classe || selectedTtd.serie) && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-gray-500">Classe/Série</span>
                      <span className="text-gray-700 text-right">{[selectedTtd.classe, selectedTtd.serie].filter(Boolean).join(' / ')}</span>
                    </div>
                  )}
                  {selectedTtd.fase_corrente && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-gray-500">Fase corrente</span>
                      <span className="text-gray-700">{selectedTtd.fase_corrente}</span>
                    </div>
                  )}
                </div>
              )}
              {selectedTtd && isEliminacao(selectedTtd.destinacao_final) && (
                <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                  <Clock size={12} />
                  Como é Eliminação, esta avaliação vai para conferência do Responsável do Eixo antes de valer.
                </p>
              )}
            </div>
          </div>

          {/* Passo 2 — confirmar e avançar */}
          <div className="flex items-start gap-3 mt-4 pt-4 border-t border-gray-100">
            <span
              className={clsx(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border mt-0.5 transition-colors',
                selectedTtd ? 'bg-teal-500 border-teal-500 text-white' : 'bg-gray-100 border-gray-200 text-gray-400',
              )}
            >
              2
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm mb-0.5">Confirme e avance</p>
              <p className="text-xs text-gray-400 mb-3">
                {selectedTtd
                  ? 'Confira o código acima e confirme para salvar esta avaliação.'
                  : 'Escolha um código no passo 1 para liberar a confirmação.'}
              </p>
              {salvar.isError && (
                <p className="mb-2 text-xs text-red-600">Erro ao salvar a avaliação. Tente novamente.</p>
              )}
              <button
                className="btn-primary text-sm w-full justify-center py-2.5"
                disabled={!selectedTtd || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                {salvar.isPending ? 'Salvando…' : 'Confirmar avaliação e ir para o próximo'} <ArrowRight size={14} />
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-1.5">
                Isso salva a decisão deste processo e já abre o próximo da caixa.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Acompanhamento de todos os processos desta caixa — para o
          avaliador sempre saber quanto já fez e quanto falta. */}
      {caixaInfo?.caixa && totalNaCaixa > 0 && (
        <div className="border-t border-gray-100 pt-3 mt-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Nesta caixa · {totalNaCaixa} processo{totalNaCaixa === 1 ? '' : 's'}
          </p>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {processos.map((p, i) => {
              const decisao = decisoes.get(p.id)
              const isDone = decisoes.has(p.id)
              const isCurrent = atual?.id === p.id
              return (
                <div
                  key={p.id}
                  className={clsx(
                    'flex items-center gap-3 py-2 text-xs',
                    isCurrent && 'bg-teal-50/70 -mx-2 px-2 rounded-lg',
                  )}
                >
                  <span
                    className={clsx(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border',
                      isDone
                        ? 'bg-teal-500 border-teal-500 text-white'
                        : isCurrent
                        ? 'bg-teal-50 border-teal-400 text-teal-700'
                        : 'bg-gray-50 border-gray-200 text-gray-400',
                    )}
                  >
                    {isDone ? <Check size={11} /> : i + 1}
                  </span>
                  <span className="font-mono text-gray-600 shrink-0">{p.numero_documento}</span>
                  <span className="text-gray-500 truncate flex-1">{p.assunto_processo || '—'}</span>
                  {isDone && (
                    <span className={clsx('font-semibold shrink-0', isEliminacao(decisao) ? 'text-red-600' : 'text-teal-600')}>
                      {isEliminacao(decisao) ? 'Eliminação' : 'Guarda Perm.'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
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

      {/* Aviso de confirmação — some sozinho depois de alguns segundos */}
      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
            <span className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
              <Check size={12} />
            </span>
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  )
}
