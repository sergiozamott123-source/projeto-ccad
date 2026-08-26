import { useQuery, useMutation } from '@tanstack/react-query'
import { Bell, CheckCircle, Clock, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

interface MemberStatus {
  usuario_id: string
  nome: string
  email: string
  pilar: string
  status: 'enviado' | 'rascunho' | 'atrasado' | 'nao_enviado'
  enviado_em: string | null
}

export function ConformidadePage() {
  const { isCoord } = useAuth()
  const mesAtual = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: membros, isLoading } = useQuery({
    queryKey: ['conformidade', mesAtual],
    queryFn: async () => {
      // Get all active members
      const { data: users } = await supabase
        .from('usuarios')
        .select('id, nome, email, pilar:pilar_id(nome)')
        .in('papel', ['membro', 'responsavel_pilar'])
        .eq('status', 'ativo')

      // Get reports for this month
      const { data: relatorios } = await supabase
        .from('relatorios_mensais')
        .select('usuario_id, status, enviado_em')
        .eq('mes_referencia', mesAtual)

      const relMap = Object.fromEntries(
        (relatorios ?? []).map(r => [r.usuario_id, r])
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((users ?? []) as unknown as Array<{
        id: string; nome: string; email: string; pilar: { nome: string } | null
      }>).map(u => ({
        usuario_id: u.id,
        nome: u.nome,
        email: u.email,
        pilar: u.pilar?.nome ?? '—',
        status: (relMap[u.id]?.status ?? 'nao_enviado') as MemberStatus['status'],
        enviado_em: relMap[u.id]?.enviado_em ?? null,
      })) as MemberStatus[]
    },
  })

  const enviados = (membros ?? []).filter(m => m.status === 'enviado').length
  const atrasados = (membros ?? []).filter(m => m.status === 'atrasado').length
  const pendentes = (membros ?? []).filter(m => m.status !== 'enviado').length

  const sendReminder = useMutation({
    mutationFn: async (email: string) => {
      // In production: call edge function to send email reminder
      console.log('Reminder sent to', email)
    },
  })

  if (!isCoord) {
    return <p className="text-gray-500">Acesso restrito ao Coordenador.</p>
  }

  const mesLabel = format(new Date(mesAtual), 'MMMM yyyy', { locale: ptBR })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conformidade dos Relatórios</h1>
        <p className="text-gray-500 text-sm mt-0.5">{mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <CheckCircle size={24} className="text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{enviados}</p>
          <p className="text-xs text-gray-500">Enviados</p>
        </div>
        <div className="card p-4 text-center">
          <Clock size={24} className="text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{pendentes}</p>
          <p className="text-xs text-gray-500">Pendentes</p>
        </div>
        <div className="card p-4 text-center">
          <XCircle size={24} className="text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{atrasados}</p>
          <p className="text-xs text-gray-500">Atrasados</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Status por membro</h2>
        </div>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Membro</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Pilar</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Enviado em</th>
                  <th className="px-4 py-3 font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(membros ?? []).map(m => (
                  <tr key={m.usuario_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{m.nome}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.pilar}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', {
                        'bg-green-100 text-green-700': m.status === 'enviado',
                        'bg-gray-100 text-gray-600': m.status === 'rascunho',
                        'bg-red-100 text-red-700': m.status === 'atrasado',
                        'bg-yellow-100 text-yellow-700': m.status === 'nao_enviado',
                      })}>
                        {m.status === 'enviado' ? 'Enviado'
                          : m.status === 'rascunho' ? 'Rascunho'
                          : m.status === 'atrasado' ? 'Atrasado'
                          : 'Não enviado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {m.enviado_em ? format(new Date(m.enviado_em), 'dd/MM/yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {m.status !== 'enviado' && (
                        <button
                          className="btn-secondary text-xs py-1 px-2"
                          onClick={() => sendReminder.mutate(m.email)}
                        >
                          <Bell size={12} /> Lembrete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
