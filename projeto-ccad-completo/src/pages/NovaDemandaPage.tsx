import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Pilar, Usuario } from '@/lib/database.types'

interface DemandaForm {
  titulo: string
  descricao: string
  pilar_id: string
  responsavel_pilar_id: string
  prazo: string
  relevancia: 'alta' | 'media' | 'baixa'
}

export function NovaDemandaPage() {
  const navigate = useNavigate()
  const { profile, isCoord } = useAuth()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<DemandaForm>({
    defaultValues: { relevancia: 'media' },
  })

  const { data: pilares } = useQuery({
    queryKey: ['pilares'],
    queryFn: async () => {
      const { data } = await supabase.from('pilares').select('*')
      return (data ?? []) as Pilar[]
    },
  })

  const { data: responsaveis } = useQuery({
    queryKey: ['todos-usuarios'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('*').order('nome')
      return (data ?? []) as Usuario[]
    },
  })

  const create = useMutation({
    mutationFn: async (form: DemandaForm) => {
      const { error } = await supabase.from('demandas').insert({
        ...form,
        pilar_id: form.pilar_id || null,
        criado_por: profile!.id,
        status: 'pendente',
      })
      if (error) throw error
    },
    onSuccess: () => navigate('/demandas'),
  })

  if (!isCoord) {
    return <p className="text-gray-500">Apenas o Coordenador pode criar demandas.</p>
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary px-2 py-2">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nova Demanda</h1>
      </div>

      <form onSubmit={handleSubmit(d => create.mutate(d))} className="card p-6 space-y-4">
        <div>
          <label className="label">Título *</label>
          <input className="input" {...register('titulo', { required: 'Título obrigatório' })} />
          {errors.titulo && <p className="text-xs text-red-600 mt-1">{errors.titulo.message}</p>}
        </div>

        <div>
          <label className="label">Descrição</label>
          <textarea className="input min-h-[80px] resize-y" {...register('descricao')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Pilar</label>
            <select className="input" {...register('pilar_id')}>
              <option value="">— Nenhum (Acervo/Protocolo Geral, ou outro assunto geral) —</option>
              {(pilares ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Responsável *</label>
            <select className="input" {...register('responsavel_pilar_id', { required: 'Responsável obrigatório' })}>
              <option value="">— Selecione —</option>
              {(responsaveis ?? []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            {errors.responsavel_pilar_id && <p className="text-xs text-red-600 mt-1">{errors.responsavel_pilar_id.message}</p>}
          </div>

          <div>
            <label className="label">Prazo *</label>
            <input type="date" className="input" {...register('prazo', { required: 'Prazo obrigatório' })} />
            {errors.prazo && <p className="text-xs text-red-600 mt-1">{errors.prazo.message}</p>}
          </div>

          <div>
            <label className="label">Relevância</label>
            <select className="input" {...register('relevancia')}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
        </div>

        {create.isError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            Erro ao criar demanda. Tente novamente.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={isSubmitting || create.isPending} className="btn-primary">
            {create.isPending ? 'Salvando…' : 'Criar Demanda'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  )
}
