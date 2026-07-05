import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Calendar, User, Flag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Demanda } from '@/lib/database.types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída',
}
const STATUS_COLOR: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluida: 'bg-green-100 text-green-700',
}

export function DemandasPage() {
  const { isCoord, profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  const { data: demandas, isLoading } = useQuery({
    queryKey: ['demandas', profile?.id, profile?.papel],
    queryFn: async () => {
      let q = supabase
        .from('demandas')
        .select('*, pilar:pilar_id(id,nome), responsavel_pilar:responsavel_pilar_id(id,nome)')
        .order('created_at', { ascending: false })

      // Filter by pilar for non-coordinators
      if (profile?.papel === 'responsavel_pilar' || profile?.papel === 'membro') {
        if (profile.pilar_id) q = q.eq('pilar_id', profile.pilar_id)
      }

      const { data } = await q
      return (data ?? []) as Demanda[]
    },
    enabled: !!profile,
  })

  const filtered = statusFilter === 'todos'
    ? (demandas ?? [])
    : (demandas ?? []).filter(d => d.status === statusFilter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} demanda(s)</p>
        </div>
        {isCoord && (
          <Link to="/demandas/nova" className="btn-primary">
            <Plus size={16} /> Nova demanda
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['todos', 'pendente', 'em_andamento', 'concluida'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              statusFilter === s
                ? 'bg-teal-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {s === 'todos' ? 'Todas' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          Nenhuma demanda encontrada.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => <DemandaCard key={d.id} demanda={d} />)}
        </div>
      )}
    </div>
  )
}

function DemandaCard({ demanda: d }: { demanda: Demanda }) {
  const { isCoord } = useAuth()
  const qc = useQueryClient()

  async function changeStatus(status: string) {
    await supabase.from('demandas').update({ status } as Partial<Demanda>).eq('id', d.id)
    qc.invalidateQueries({ queryKey: ['demandas'] })
  }

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className={clsx('mt-1 w-2.5 h-2.5 rounded-full shrink-0', {
          'bg-yellow-400': d.relevancia === 'alta',
          'bg-blue-400':   d.relevancia === 'media',
          'bg-gray-300':   d.relevancia === 'baixa',
        })} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm">{d.titulo}</h3>
            <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[d.status])}>
              {STATUS_LABEL[d.status]}
            </span>
          </div>
          {d.descricao && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{d.descricao}</p>}
          <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-gray-400">
            {d.pilar && (
              <span className="flex items-center gap-1">
                <Flag size={12} /> {(d.pilar as { nome: string }).nome}
              </span>
            )}
            {d.responsavel_pilar && (
              <span className="flex items-center gap-1">
                <User size={12} /> {(d.responsavel_pilar as { nome: string }).nome}
              </span>
            )}
            {d.prazo && (
              <span className="flex items-center gap-1">
                <Calendar size={12} /> {format(new Date(d.prazo), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            )}
            <span className={d.relevancia === 'alta' ? 'badge-alta' : d.relevancia === 'media' ? 'badge-media' : 'badge-baixa'}>
              {d.relevancia}
            </span>
          </div>
        </div>
        {isCoord && d.status !== 'concluida' && (
          <select
            className="input w-36 text-xs"
            value={d.status}
            onChange={e => changeStatus(e.target.value)}
          >
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
          </select>
        )}
      </div>
    </div>
  )
}

