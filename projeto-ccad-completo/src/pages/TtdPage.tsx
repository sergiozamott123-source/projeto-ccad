import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { TtdCodigo } from '@/lib/database.types'
import clsx from 'clsx'

export function TtdPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [classeFilter, setClasseFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [showProposta, setShowProposta] = useState(false)
  const [proposta, setProposta] = useState({ ttd_codigo_id: '', justificativa: '' })

  const { data: ttds, isLoading } = useQuery({
    queryKey: ['ttd-codigos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .order('codigo')
      return (data ?? []) as TtdCodigo[]
    },
  })

  const filtered = (ttds ?? []).filter(t => {
    const matchSearch = !search
      || t.codigo.toLowerCase().includes(search.toLowerCase())
      || t.assunto.toLowerCase().includes(search.toLowerCase())
      || t.serie.toLowerCase().includes(search.toLowerCase())
    const matchClasse = classeFilter === 'todos' || t.classe.startsWith(classeFilter)
    const matchStatus = statusFilter === 'todos' || t.status === statusFilter
    return matchSearch && matchClasse && matchStatus
  })

  const submitProposta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('propostas_revisao_ttd').insert({
        ttd_codigo_id: proposta.ttd_codigo_id || null,
        proposto_por: profile!.id,
        justificativa: proposta.justificativa,
        status: 'em_analise',
      })
      if (error) throw error
    },
    onSuccess: () => {
      setShowProposta(false)
      setProposta({ ttd_codigo_id: '', justificativa: '' })
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tabela de Temporalidade Documental</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {filtered.length} código(s) exibido(s) de {(ttds ?? []).length} total
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => setShowProposta(v => !v)}>
          <MessageSquare size={14} /> Propor revisão
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por código, série ou assunto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-44" value={classeFilter} onChange={e => setClasseFilter(e.target.value)}>
          <option value="todos">Todas as classes</option>
          <option value="01">01 — Ativ. Meio</option>
          <option value="02">02 — Ativ. Fim</option>
        </select>
        <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="todos">Todos status</option>
          <option value="vigente">Vigente</option>
          <option value="proposta">Proposta</option>
          <option value="descontinuado">Descontinuado</option>
        </select>
      </div>

      {/* Proposal form */}
      {showProposta && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Proposta de Revisão de Código TTD</h2>
          <div>
            <label className="label">Código TTD a revisar (deixe vazio para propor código novo)</label>
            <select className="input" value={proposta.ttd_codigo_id} onChange={e => setProposta(v => ({ ...v, ttd_codigo_id: e.target.value }))}>
              <option value="">— Novo código —</option>
              {(ttds ?? []).filter(t => t.status === 'vigente').map(t => (
                <option key={t.id} value={t.id}>{t.codigo} — {t.assunto}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Justificativa *</label>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder="Descreva a motivação para a revisão ou criação do código…"
              value={proposta.justificativa}
              onChange={e => setProposta(v => ({ ...v, justificativa: e.target.value }))}
            />
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary"
              disabled={!proposta.justificativa || submitProposta.isPending}
              onClick={() => submitProposta.mutate()}
            >
              Enviar proposta
            </button>
            <button className="btn-secondary" onClick={() => setShowProposta(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Carregando TTD…</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left border-b">
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-24">Código</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-48">Série</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600">Assunto</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600">Espécie</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-24">F. Corrente</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-24">F. Interm.</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-28">Destinação</th>
                  <th className="px-3 py-2.5 font-medium text-gray-600 w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => (
                  <tr key={t.id} className={clsx('hover:bg-gray-50', t.status === 'proposta' && 'bg-orange-50/50')}>
                    <td className="px-3 py-2 font-mono font-semibold text-teal-700">{t.codigo}</td>
                    <td className="px-3 py-2 text-gray-600">{t.serie}</td>
                    <td className="px-3 py-2 text-gray-800">{t.assunto}</td>
                    <td className="px-3 py-2 text-gray-500">{t.especie}</td>
                    <td className="px-3 py-2 text-gray-600">{t.fase_corrente}</td>
                    <td className="px-3 py-2 text-gray-600">{t.fase_intermediaria}</td>
                    <td className={clsx('px-3 py-2 font-medium',
                      t.destinacao_final?.toLowerCase().includes('elimin') ? 'text-red-600' : 'text-teal-700'
                    )}>
                      {t.destinacao_final}
                    </td>
                    <td className="px-3 py-2">
                      {t.status === 'vigente'
                        ? <span className="badge-vigente">vigente</span>
                        : t.status === 'proposta'
                        ? <span className="badge-proposta">proposta</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">descont.</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
