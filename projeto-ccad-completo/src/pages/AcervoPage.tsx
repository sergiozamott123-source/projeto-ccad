import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Archive, BookOpen, AlertCircle, Plus, Search, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Processo } from '@/lib/database.types'
import clsx from 'clsx'

export function AcervoPage({ titulo = 'Acervo' }: { titulo?: string }) {
  const { isCoord, isResponsavel } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')

  const { data: stats } = useQuery({
    queryKey: ['acervo-stats'],
    queryFn: async () => {
      const [caixas, processos, revisao, ttd] = await Promise.all([
        supabase.from('caixas').select('*', { count: 'exact', head: true }),
        supabase.from('processos').select('*', { count: 'exact', head: true }),
        supabase.from('processos').select('*', { count: 'exact', head: true }).eq('requer_revisao_manual', true),
        supabase.from('ttd_codigos').select('*', { count: 'exact', head: true }).eq('status', 'vigente'),
      ])
      return {
        caixas: caixas.count ?? 0,
        processos: processos.count ?? 0,
        revisao: revisao.count ?? 0,
        ttd: ttd.count ?? 0,
      }
    },
  })

  const { data: buscaResultados } = useQuery({
    queryKey: ['acervo-busca', busca],
    queryFn: async () => {
      if (busca.length < 2) return []
      const { data } = await supabase
        .from('processos')
        .select('*, caixa:caixa_id(numero,setor), ttd:ttd_codigo_id(codigo,assunto)')
        .or(`numero_documento.ilike.%${busca}%,interessado.ilike.%${busca}%,assunto_processo.ilike.%${busca}%`)
        .limit(20)
      return (data ?? []) as Processo[]
    },
    enabled: busca.length >= 2,
  })

  const toggleExpositivo = useMutation({
    mutationFn: async (p: Processo) => {
      await supabase.from('processos').update({ potencial_expositivo: !p.potencial_expositivo }).eq('id', p.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acervo-busca'] })
      qc.invalidateQueries({ queryKey: ['processos-potencial-expositivo'] })
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        <p className="text-gray-500 text-sm mt-0.5">Catalogação e gestão do acervo com base na TTD.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Caixas', value: stats?.caixas ?? 0, icon: <Archive size={20} className="text-teal-600" />, color: 'bg-teal-50' },
          { label: 'Processos', value: stats?.processos ?? 0, icon: <BookOpen size={20} className="text-blue-600" />, color: 'bg-blue-50' },
          { label: 'Fila de revisão', value: stats?.revisao ?? 0, icon: <AlertCircle size={20} className="text-orange-600" />, color: 'bg-orange-50' },
          { label: 'Códigos TTD vigentes', value: stats?.ttd ?? 0, icon: <BookOpen size={20} className="text-purple-600" />, color: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{s.value.toLocaleString('pt-BR')}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${s.color}`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(isCoord || isResponsavel) && (
          <Link to="catalogar" className="card p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-50 group-hover:bg-teal-100 transition-colors">
                <Plus size={20} className="text-teal-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Catalogar Processo</p>
                <p className="text-xs text-gray-400">Vincular processo à TTD</p>
              </div>
            </div>
          </Link>
        )}

        <Link to="ttd" className="card p-5 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 group-hover:bg-purple-100 transition-colors">
              <BookOpen size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Tabela TTD</p>
              <p className="text-xs text-gray-400">Consultar e propor revisões</p>
            </div>
          </div>
        </Link>

        {(isCoord || isResponsavel) && (
          <Link to="revisao" className="card p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-50 group-hover:bg-orange-100 transition-colors">
                <AlertCircle size={20} className="text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Fila de Revisão</p>
                <p className="text-xs text-gray-400">{stats?.revisao ?? 0} processos aguardando</p>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Busca / listagem geral do acervo */}
      <div id="buscar-memoria" className="card p-5 scroll-mt-4">
        <h2 className="font-semibold text-gray-900 mb-3">Buscar no Acervo</h2>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nº do documento, interessado ou assunto…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Marque com a estrela os itens candidatos ao Espaço Memória da CDTIV.
        </p>
        {busca.length >= 2 && (
          (buscaResultados ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum processo encontrado.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(buscaResultados ?? []).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-900">{p.numero_documento}</span>
                      {p.ttd && <span className="font-mono text-xs text-teal-600">{(p.ttd as { codigo?: string }).codigo}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{p.assunto_processo || p.interessado}</p>
                  </div>
                  <button
                    className={clsx(
                      'shrink-0 p-1.5 rounded-lg border transition-colors',
                      p.potencial_expositivo ? 'bg-accent-50 border-accent-300' : 'border-gray-200 hover:bg-gray-50',
                    )}
                    title="Marcar como candidato ao Espaço Memória"
                    onClick={() => toggleExpositivo.mutate(p)}
                  >
                    <Star size={16} className={p.potencial_expositivo ? 'fill-accent-500 text-accent-500' : 'text-gray-400'} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
