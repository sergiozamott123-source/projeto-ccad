import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PILAR_NOMES } from '@/lib/pilarColors'

const PILAR_PAGE_ROUTE: Record<string, string> = {
  [PILAR_NOMES.BOAS_PRATICAS]: '/pilares/boas-praticas',
  [PILAR_NOMES.MEMORIA]: '/pilares/memoria',
  [PILAR_NOMES.DIGITALIZACAO]: '/acervo',
}

// Decides the landing page after login based on the user's papel.
// Coordenador/Coordenador substituto keep the full Superpainel; Responsável
// de Pilar goes straight to their own pilar page; Membro goes to Minha Parte.
export function RoleHome() {
  const { profile, profileLoading, isCoord, isMembro, isResponsavel } = useAuth()

  const { data: pilarNome, isLoading: pilarLoading } = useQuery({
    queryKey: ['role-home-pilar', profile?.pilar_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('nome')
        .eq('id', profile!.pilar_id as string)
        .single()
      return data?.nome ?? null
    },
    enabled: isResponsavel && !!profile?.pilar_id,
  })

  if (profileLoading || !profile) return null

  if (isCoord) return <Navigate to="/dashboard" replace />
  if (isMembro) return <Navigate to="/minha-parte" replace />

  if (isResponsavel) {
    if (!profile.pilar_id) return <Navigate to="/dashboard" replace />
    if (pilarLoading) return null
    const route = pilarNome ? PILAR_PAGE_ROUTE[pilarNome] : undefined
    return <Navigate to={route ?? '/dashboard'} replace />
  }

  return <Navigate to="/dashboard" replace />
}
