import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Mail, Plus, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Usuario, Pilar, SetorCdtiv } from '@/lib/database.types'
import clsx from 'clsx'

const PAPEL_LABELS: Record<string, string> = {
  coordenador: 'Coordenador',
  coordenador_substituto: 'Coord. Substituto',
  responsavel_pilar: 'Resp. Pilar',
  membro: 'Membro',
  apoio_tecnico: 'Apoio Técnico',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  convite_pendente: 'Convite Pendente',
}

export function EquipePage() {
  const { isCoord } = useAuth()
  const qc = useQueryClient()
  const [showConvite, setShowConvite] = useState(false)
  const [convite, setConvite] = useState({ nome: '', email: '', papel: 'membro', pilar_id: '' })
  const [novoSetor, setNovoSetor] = useState('')

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('*').order('nome')
      return (data ?? []) as Usuario[]
    },
  })

  const { data: pilares } = useQuery({
    queryKey: ['pilares'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('*, responsavel:responsavel_id(id,nome)')
      return (data ?? []) as (Pilar & { responsavel: { id: string; nome: string } | null })[]
    },
  })

  const updateResponsavel = useMutation({
    mutationFn: async ({ pilarId, userId }: { pilarId: string; userId: string }) => {
      await supabase.from('pilares').update({ responsavel_id: userId }).eq('id', pilarId)
      if (userId) {
        // coordenador/coordenador_substituto outrank responsavel_pilar and must never be
        // downgraded by this action — only set pilar_id, leave papel untouched for them.
        const atual = (usuarios ?? []).find(u => u.id === userId)
        const papelProtegido = atual?.papel === 'coordenador' || atual?.papel === 'coordenador_substituto'
        await supabase.from('usuarios').update(
          papelProtegido ? { pilar_id: pilarId } : { papel: 'responsavel_pilar', pilar_id: pilarId }
        ).eq('id', userId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pilares'] })
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })

  // Lista oficial de Setores da CDTIV — usada nas telas de Requisições e
  // Catalogação para que o usuário escolha o setor de origem de uma
  // lista, em vez de digitar (só digita quando o setor for realmente
  // novo, o que já o cadastra aqui automaticamente).
  const { data: setores } = useQuery({
    queryKey: ['setores-cdtiv-gerenciar'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setores_cdtiv').select('*').order('sigla')
      if (error) throw error
      return (data ?? []) as SetorCdtiv[]
    },
  })

  function invalidarSetores() {
    qc.invalidateQueries({ queryKey: ['setores-cdtiv-gerenciar'] })
    qc.invalidateQueries({ queryKey: ['setores-disponiveis'] })
  }

  const adicionarSetor = useMutation({
    mutationFn: async () => {
      const sigla = novoSetor.trim().toUpperCase()
      if (!sigla) return
      const { error } = await supabase.from('setores_cdtiv').upsert({ sigla, ativo: true }, { onConflict: 'sigla' })
      if (error) throw error
    },
    onSuccess: () => {
      invalidarSetores()
      setNovoSetor('')
    },
  })

  const alternarSetorAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('setores_cdtiv').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidarSetores,
  })

  const sendConvite = useMutation({
    mutationFn: async () => {
      // In production this would call a Supabase edge function to invite via email.
      // For now: create user record with convite_pendente status.
      const { error } = await supabase.from('usuarios').insert({
        nome: convite.nome,
        email: convite.email,
        papel: convite.papel as Usuario['papel'],
        pilar_id: convite.pilar_id || null,
        status: 'convite_pendente',
      } as Partial<Usuario>)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setShowConvite(false)
      setConvite({ nome: '', email: '', papel: 'membro', pilar_id: '' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipe & Responsáveis</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestão de membros, papéis e responsáveis por pilar.</p>
        </div>
        {isCoord && (
          <button className="btn-primary" onClick={() => setShowConvite(v => !v)}>
            <UserPlus size={16} /> Convidar membro
          </button>
        )}
      </div>

      {/* Responsáveis por pilar */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Responsáveis por Pilar</h2>
        <div className="space-y-3">
          {(pilares ?? []).map(pilar => (
            <div key={pilar.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="text-sm font-medium text-gray-800">{pilar.nome}</span>
              {isCoord ? (
                <select
                  className="input w-48 text-sm"
                  value={pilar.responsavel?.id ?? ''}
                  onChange={e => updateResponsavel.mutate({ pilarId: pilar.id, userId: e.target.value })}
                >
                  <option value="">— Sem responsável —</option>
                  {(usuarios ?? []).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-600">{pilar.responsavel?.nome ?? '—'}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Setores da CDTIV */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">Setores da CDTIV</h2>
        </div>
        <p className="text-gray-500 text-xs mb-4">
          Esta é a lista oficial que aparece para escolher em "Setor de origem" nas telas de Requisições e Catalogação. Um setor desativado aqui deixa de aparecer para seleção, mas os processos já cadastrados com ele continuam normalmente.
        </p>

        {isCoord && (
          <div className="flex gap-2 mb-4">
            <input
              className="input sm:w-56"
              placeholder="Sigla do novo setor (ex.: NSP)"
              value={novoSetor}
              onChange={e => setNovoSetor(e.target.value.toUpperCase())}
            />
            <button
              className="btn-secondary text-sm"
              onClick={() => adicionarSetor.mutate()}
              disabled={!novoSetor.trim() || adicionarSetor.isPending}
            >
              <Plus size={15} /> Adicionar
            </button>
          </div>
        )}

        {(setores ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum setor cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(setores ?? []).map(s => (
              <span
                key={s.id}
                className={clsx(
                  'flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full',
                  s.ativo ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400 line-through',
                )}
              >
                {s.sigla}
                {isCoord && (
                  <button
                    type="button"
                    className="no-underline font-normal text-[11px] underline decoration-dotted hover:opacity-70"
                    onClick={() => alternarSetorAtivo.mutate({ id: s.id, ativo: !s.ativo })}
                    disabled={alternarSetorAtivo.isPending}
                  >
                    {s.ativo ? 'desativar' : 'reativar'}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Convite form */}
      {showConvite && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Convidar Novo Membro</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome completo</label>
              <input className="input" value={convite.nome} onChange={e => setConvite(v => ({ ...v, nome: e.target.value }))} />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={convite.email} onChange={e => setConvite(v => ({ ...v, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Papel</label>
              <select className="input" value={convite.papel} onChange={e => setConvite(v => ({ ...v, papel: e.target.value }))}>
                {Object.entries(PAPEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Pilar</label>
              <select className="input" value={convite.pilar_id} onChange={e => setConvite(v => ({ ...v, pilar_id: e.target.value }))}>
                <option value="">— Nenhum —</option>
                {(pilares ?? []).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              className="btn-primary"
              onClick={() => sendConvite.mutate()}
              disabled={!convite.nome || !convite.email || sendConvite.isPending}
            >
              <Mail size={16} /> Enviar convite
            </button>
            <button className="btn-secondary" onClick={() => setShowConvite(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Team table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Todos os membros</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="px-4 py-3 font-medium text-gray-600">E-mail</th>
                <th className="px-4 py-3 font-medium text-gray-600">Papel</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(usuarios ?? []).map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      u.papel === 'coordenador' || u.papel === 'coordenador_substituto'
                        ? 'bg-navy-100 text-navy-700'
                        : u.papel === 'responsavel_pilar'
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-gray-100 text-gray-600',
                    )}>
                      {PAPEL_LABELS[u.papel] ?? u.papel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      u.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
                    )}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
