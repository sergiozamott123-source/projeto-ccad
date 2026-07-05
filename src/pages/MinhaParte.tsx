import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Demanda, Pilar } from '@/lib/database.types'
import { format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

export function MinhaParte() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [indicador, setIndicador] = useState({
    caixas_organizadas: 0,
    paginas_digitalizadas: 0,
    documentos_indexados: 0,
    evidencia_url: '',
  })
  const [showIndicador, setShowIndicador] = useState(false)

  const mesAtual = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: pilar } = useQuery({
    queryKey: ['meu-pilar', profile?.pilar_id],
    queryFn: async () => {
      if (!profile?.pilar_id) return null
      const { data } = await supabase
        .from('pilares')
        .select('*, fases(*)')
        .eq('id', profile.pilar_id)
        .single()
      return data as (Pilar & { fases: { id: string; nome: string; percentual_conclusao: number; ordem: number }[] }) | null
    },
    enabled: !!profile?.pilar_id,
  })

  const { data: demandas } = useQuery({
    queryKey: ['minhas-demandas', profile?.id],
    queryFn: async () => {
      // Get demandas where user is member
      const { data: dm } = await supabase
        .from('demanda_membros')
        .select('demanda_id')
        .eq('usuario_id', profile!.id)
      const ids = (dm ?? []).map(d => d.demanda_id)

      if (ids.length === 0) return []

      const { data } = await supabase
        .from('demandas')
        .select('*, pilar:pilar_id(id,nome)')
        .in('id', ids)
        .neq('status', 'concluida')
        .order('prazo')
      return (data ?? []) as Demanda[]
    },
    enabled: !!profile?.id,
  })

  const salvarIndicador = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('indicadores_mensais').insert({
        pilar_id: profile!.pilar_id,
        usuario_id: profile!.id,
        mes_referencia: mesAtual,
        ...indicador,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['indicadores-totais'] })
      setShowIndicador(false)
      setIndicador({ caixas_organizadas: 0, paginas_digitalizadas: 0, documentos_indexados: 0, evidencia_url: '' })
    },
  })

  if (!profile) return null

  const mesLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Parte</h1>
        <p className="text-gray-500 text-sm mt-0.5">{mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}</p>
      </div>

      {/* Pilar card */}
      {pilar && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{pilar.nome}</h2>
          <div className="space-y-2">
            {pilar.fases?.sort((a, b) => a.ordem - b.ordem).map(fase => (
              <div key={fase.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700">{fase.nome}</span>
                  <span className="font-medium">{fase.percentual_conclusao}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-teal-500"
                    style={{ width: `${fase.percentual_conclusao}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lançar indicador */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Indicadores do Mês</h2>
          <button
            className="btn-secondary text-sm"
            onClick={() => setShowIndicador(v => !v)}
          >
            <TrendingUp size={14} /> Lançar indicador
          </button>
        </div>
        {showIndicador && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Caixas organizadas</label>
                <input type="number" min={0} className="input"
                  value={indicador.caixas_organizadas}
                  onChange={e => setIndicador(v => ({ ...v, caixas_organizadas: +e.target.value }))} />
              </div>
              <div>
                <label className="label">Páginas digitalizadas</label>
                <input type="number" min={0} className="input"
                  value={indicador.paginas_digitalizadas}
                  onChange={e => setIndicador(v => ({ ...v, paginas_digitalizadas: +e.target.value }))} />
              </div>
              <div>
                <label className="label">Documentos indexados</label>
                <input type="number" min={0} className="input"
                  value={indicador.documentos_indexados}
                  onChange={e => setIndicador(v => ({ ...v, documentos_indexados: +e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">URL da evidência</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="https://..."
                  value={indicador.evidencia_url}
                  onChange={e => setIndicador(v => ({ ...v, evidencia_url: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={salvarIndicador.isPending}
                onClick={() => salvarIndicador.mutate()}
              >
                <Upload size={14} /> Salvar indicador
              </button>
              <button className="btn-secondary" onClick={() => setShowIndicador(false)}>Cancelar</button>
            </div>
            {salvarIndicador.isError && (
              <p className="text-sm text-red-600">Erro ao salvar. Tente novamente.</p>
            )}
          </div>
        )}
      </div>

      {/* Minhas demandas */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Minhas Demandas</h2>
        {(demandas ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma demanda ativa no momento.</p>
        ) : (
          <div className="space-y-2">
            {(demandas ?? []).map(d => (
              <div key={d.id} className={clsx(
                'flex items-start justify-between p-3 rounded-lg border',
                d.status === 'em_andamento' ? 'border-blue-200 bg-blue-50' : 'border-gray-200',
              )}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                  {d.prazo && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Prazo: {format(new Date(d.prazo), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  )}
                </div>
                <span className={clsx(
                  'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                  d.relevancia === 'alta' ? 'badge-alta' : d.relevancia === 'media' ? 'badge-media' : 'badge-baixa',
                )}>
                  {d.relevancia}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
