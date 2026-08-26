import { Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Usuario } from '@/lib/database.types'

export function RequireAcesso({ allow }: { allow: (profile: Usuario | null) => boolean }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!allow(profile)) {
    return (
      <div className="card p-8 text-center text-gray-500">
        Acesso restrito. Esta área é reservada à Coordenação e à equipe autorizada do Acervo.
      </div>
    )
  }
  return <Outlet />
}
