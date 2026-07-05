import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ScanLine, ListChecks, Landmark, LayoutDashboard, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PILAR_NOMES } from '@/lib/pilarColors'
import portalHero from '@/assets/portal-hero.jpg'

const PILAR_PAGE_ROUTE: Record<string, string> = {
  [PILAR_NOMES.BOAS_PRATICAS]: '/pilares/boas-praticas',
  [PILAR_NOMES.MEMORIA]: '/pilares/memoria',
  [PILAR_NOMES.DIGITALIZACAO]: '/pilares/digitalizacao',
}

export function WelcomePage() {
  const { profile, profileLoading, isCoord, isMembro, isResponsavel } = useAuth()
  const navigate = useNavigate()

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
    enabled: (isResponsavel || isMembro) && !!profile?.pilar_id,
  })

  if (profileLoading || !profile) return null
  if ((isResponsavel || isMembro) && profile.pilar_id && pilarLoading) return null

  const primeiroNome = profile.nome.split(' ')[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="relative w-full h-[42vh] md:h-[55vh]" style={{ minHeight: 240, maxHeight: 520 }}>
        <img
          src={portalHero}
          alt="Portal da CDTIV"
          className="w-full h-full object-cover object-[center_top]"
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-12"
          style={{ background: 'linear-gradient(to bottom, transparent, #f9fafb)' }}
        />
      </div>

      <div className="mx-auto px-6 pt-12 pb-16" style={{ maxWidth: 900 }}>
        <div className="text-center animate-fade-in-up">
          <h1 className="text-3xl font-semibold text-gray-900">Bem-vindo(a), {primeiroNome}</h1>
          <p className="text-gray-500 mt-4 mx-auto" style={{ maxWidth: 560, lineHeight: 1.7 }}>
            Cada processo organizado e cada página preservada constrói a memória viva da CDTIV — o
            registro do que a Cia já construiu, e a base do que ainda vai construir.
          </p>

          <ChevronDown size={20} className="text-gray-300 mx-auto mt-4 animate-bounce-soft" />

          <div className="mt-10">
            {isCoord && (
              <div>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="card w-full p-5 border-2 border-teal-500 transition-transform transition-shadow duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-50 group-hover:bg-teal-100 transition-colors">
                      <LayoutDashboard size={20} className="text-teal-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Superpainel</p>
                      <p className="text-xs text-gray-400">
                        Visão geral dos três pilares, indicadores e Mural de Conquistas
                      </p>
                    </div>
                  </div>
                </button>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <button
                    onClick={() => navigate('/pilares/digitalizacao')}
                    className="card p-5 transition-transform transition-shadow duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-teal-50 group-hover:bg-teal-100 transition-colors">
                        <ScanLine size={20} className="text-teal-600" />
                      </div>
                      <p className="font-semibold text-gray-900">Digitalização do Acervo</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/pilares/boas-praticas')}
                    className="card p-5 transition-transform transition-shadow duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors">
                        <ListChecks size={20} className="text-blue-600" />
                      </div>
                      <p className="font-semibold text-gray-900">Protocolo de Boas Práticas</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/pilares/memoria')}
                    className="card p-5 transition-transform transition-shadow duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-purple-50 group-hover:bg-purple-100 transition-colors">
                        <Landmark size={20} className="text-purple-600" />
                      </div>
                      <p className="font-semibold text-gray-900">Espaço Memória da CDTIV</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {isResponsavel && (
              <div className="card p-6 text-center mx-auto" style={{ maxWidth: 420 }}>
                <p className="font-semibold text-gray-900 mb-4">
                  {pilarNome ?? 'Seu pilar'}
                </p>
                <button
                  onClick={() => navigate(profile.pilar_id && pilarNome ? (PILAR_PAGE_ROUTE[pilarNome] ?? '/dashboard') : '/dashboard')}
                  className="btn-primary"
                >
                  Entrar
                </button>
              </div>
            )}

            {isMembro && (
              <div className="card p-6 text-center mx-auto" style={{ maxWidth: 420 }}>
                <p className="font-semibold text-gray-900 mb-4">
                  {pilarNome ? `Minha Parte — ${pilarNome}` : 'Minha Parte'}
                </p>
                <button onClick={() => navigate('/minha-parte')} className="btn-primary">
                  Ir para Minha Parte
                </button>
              </div>
            )}

            {!isCoord && !isResponsavel && !isMembro && (
              <div className="text-center">
                <button onClick={() => navigate('/dashboard')} className="btn-primary">
                  Entrar no Superpainel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
