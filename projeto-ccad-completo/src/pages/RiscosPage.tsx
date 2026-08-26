import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Risco, Pilar } from '@/lib/database.types'
import clsx from 'clsx'

const IMPACTO: ('alto' | 'medio' | 'baixo')[] = ['alto', 'medio', 'baixo']
const PROB: ('alta' | 'media' | 'baixa')[] = ['alta', 'media', 'baixa']

function cellColor(impacto: string, prob: string) {
  const score = (impacto === 'alto' ? 3 : impacto === 'medio' ? 2 : 1)
              + (prob === 'alta' ? 3 : prob === 'media' ? 2 : 1)
  if (score >= 5) return 'bg-red-200 text-red-900'
  if (score === 4) return 'bg-orange-100 text-orange-900'
  return 'bg-green-100 text-green-900'
}

export function RiscosPage() {
  const { isCoord } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descricao: '', impacto: 'medio' as Risco['impacto'],
    probabilidade: 'media' as Risco['probabilidade'],
    mitigacao: '', pilar_id: '',
  })

  const { data: riscos } = useQuery({
    queryKey: ['riscos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('riscos')
        .select('*, pilar:pilar_id(id,nome)')
        .eq('status', 'ativo')
      return (data ?? []) as Risco[]
    },
  })

  const { data: pilares } = useQuery({
    queryKey: ['pilares'],
    queryFn: async () => {
      const { data } = await supabase.from('pilares').select('id,nome')
      return (data ?? []) as Pick<Pilar, 'id' | 'nome'>[]
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('riscos').insert({ ...form, status: 'ativo' } as Partial<Risco>)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['riscos'] })
      setShowForm(false)
      setForm({ titulo: '', descricao: '', impacto: 'medio', probabilidade: 'media', mitigacao: '', pilar_id: '' })
    },
  })

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('riscos').update({ status: 'resolvido' } as Partial<Risco>).eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['riscos'] }),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matriz de Riscos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{(riscos ?? []).length} risco(s) ativo(s)</p>
        </div>
        {isCoord && (
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={16} /> Novo risco
          </button>
        )}
      </div>

      {/* Matrix grid */}
      <div className="card p-5 overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-4">Grade Impacto × Probabilidade</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-gray-500 font-medium w-24">Impacto ↓ / Prob. →</th>
              {PROB.map(p => (
                <th key={p} className="p-2 text-center font-medium text-gray-600 capitalize">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {IMPACTO.map(imp => (
              <tr key={imp}>
                <td className="p-2 font-medium text-gray-600 capitalize">{imp}</td>
                {PROB.map(prob => {
                  const count = (riscos ?? []).filter(r => r.impacto === imp && r.probabilidade === prob).length
                  return (
                    <td key={prob} className={clsx('p-4 text-center rounded-md border-2 border-white', cellColor(imp, prob))}>
                      <span className="font-bold text-lg">{count || '—'}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Registrar Risco</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Título *</label>
              <input className="input" value={form.titulo} onChange={e => setForm(v => ({ ...v, titulo: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Descrição</label>
              <textarea className="input min-h-[80px] resize-y" value={form.descricao} onChange={e => setForm(v => ({ ...v, descricao: e.target.value }))} />
            </div>
            <div>
              <label className="label">Pilar</label>
              <select className="input" value={form.pilar_id} onChange={e => setForm(v => ({ ...v, pilar_id: e.target.value }))}>
                <option value="">— Todos os pilares —</option>
                {(pilares ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Impacto</label>
              <select className="input" value={form.impacto} onChange={e => setForm(v => ({ ...v, impacto: e.target.value as Risco['impacto'] }))}>
                <option value="alto">Alto</option>
                <option value="medio">Médio</option>
                <option value="baixo">Baixo</option>
              </select>
            </div>
            <div>
              <label className="label">Probabilidade</label>
              <select className="input" value={form.probabilidade} onChange={e => setForm(v => ({ ...v, probabilidade: e.target.value as Risco['probabilidade'] }))}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div>
              <label className="label">Mitigação</label>
              <textarea className="input min-h-[60px] resize-y" value={form.mitigacao} onChange={e => setForm(v => ({ ...v, mitigacao: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary"
              disabled={!form.titulo || create.isPending}
              onClick={() => create.mutate()}
            >
              Salvar risco
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Risk list */}
      <div className="space-y-3">
        {(riscos ?? []).map(r => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm">{r.titulo}</h3>
                  <span className={r.impacto === 'alto' ? 'badge-alta' : r.impacto === 'medio' ? 'badge-media' : 'badge-baixa'}>
                    Impacto: {r.impacto}
                  </span>
                  <span className={r.probabilidade === 'alta' ? 'badge-alta' : r.probabilidade === 'media' ? 'badge-media' : 'badge-baixa'}>
                    Prob: {r.probabilidade}
                  </span>
                  {r.pilar && (
                    <span className="text-xs text-gray-400">{(r.pilar as { nome: string }).nome}</span>
                  )}
                </div>
                {r.descricao && <p className="text-sm text-gray-500">{r.descricao}</p>}
                {r.mitigacao && (
                  <p className="text-xs text-gray-400 mt-1">
                    <span className="font-medium">Mitigação:</span> {r.mitigacao}
                  </p>
                )}
              </div>
              {isCoord && (
                <button
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  onClick={() => dismiss.mutate(r.id)}
                  title="Marcar como resolvido"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
