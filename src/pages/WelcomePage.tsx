import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ScanLine, ListChecks, Landmark, LayoutDashboard, ChevronDown, Boxes, FileBarChart, ClipboardCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDevolvidosDoAvaliador, totalDevolvidos } from '@/lib/devolvidosAvaliador'
import { useAuth } from '@/contexts/AuthContext'
import { PILAR_NOMES } from '@/lib/pilarColors'
import { BOAS_PRATICAS_EM_PAUSA, DIGITALIZACAO_EM_PAUSA, MEMORIA_EM_PAUSA, TODOS_PILARES_EM_PAUSA, pilarEmPausa } from '@/lib/pilaresEmPausa'

const PILAR_PAGE_ROUTE: Record<string, string> = {
  [PILAR_NOMES.BOAS_PRATICAS]: '/pilares/boas-praticas',
  [PILAR_NOMES.MEMORIA]: '/pilares/memoria',
  [PILAR_NOMES.DIGITALIZACAO]: '/pilares/digitalizacao',
}

// Quantos cartões de pilar aparecem (os que não estão em pausa) — a grade se
// ajusta para não deixar buracos.
const qtdPilaresVisiveis = [DIGITALIZACAO_EM_PAUSA, BOAS_PRATICAS_EM_PAUSA, MEMORIA_EM_PAUSA].filter(p => !p).length
const colunasPilares =
  qtdPilaresVisiveis >= 3 ? 'md:grid-cols-3'
    : qtdPilaresVisiveis === 2 ? 'md:grid-cols-2'
      : 'md:grid-cols-1 max-w-sm mx-auto'

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

  // Perfil "conferência" (Ariadne e Júlia): cartão com quantas avaliações
  // esperam conferência. Mesma consulta e mesma chave do contador do menu.
  const mostrarConferencia = profile?.menu_perfil === 'conferencia'
  const { data: pendentesConferencia } = useQuery({
    queryKey: ['eliminacoes-pendentes-count', profile?.id, profile?.pilar_id, true],
    queryFn: async () => {
      const { count } = await supabase
        .from('avaliacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aguardando_confirmacao')
      return count ?? 0
    },
    enabled: !!profile?.id && mostrarConferencia,
  })

  // Perfil "avaliação": cartão "Minhas avaliações" com o que está esperando.
  const mostrarAvaliacao = profile?.menu_perfil === 'avaliacao'
  const { data: gruposDevolvidos } = useDevolvidosDoAvaliador()
  const devolvidos = totalDevolvidos(gruposDevolvidos ?? [])
  const { data: caixasEsperando } = useQuery({
    queryKey: ['avaliador-caixas-esperando-count', profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('requisicoes_avaliacao')
        .select('*', { count: 'exact', head: true })
        .eq('avaliador_id', profile!.id)
        .eq('status', 'pendente')
      return count ?? 0
    },
    enabled: !!profile?.id && mostrarAvaliacao,
  })

  if (profileLoading || !profile) return null
  if ((isResponsavel || isMembro) && profile.pilar_id && pilarLoading) return null

  const primeiroNome = profile.nome.split(' ')[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="relative w-full h-[42vh] md:h-[55vh] flex items-center justify-center"
        style={{
          minHeight: 240,
          maxHeight: 520,
          background: 'linear-gradient(135deg, var(--dv-primaria) 0%, var(--dv-marinho) 100%)',
        }}
      >
        <span className="text-white/90 text-xl md:text-2xl font-semibold tracking-wide text-center px-6">
          Portal da CDTIV
        </span>
        <div
          className="absolute bottom-0 left-0 right-0 h-12"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--dv-fundo))' }}
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
                      <p className="text-xs text-gray-500">
                        Visão geral, indicadores e Mural de Conquistas
                      </p>
                    </div>
                  </div>
                </button>

                {!TODOS_PILARES_EM_PAUSA && (
                <div className={`grid grid-cols-1 gap-4 mt-6 ${colunasPilares}`}>
                  {/* Pilares em pausa ficam escondidos (src/lib/pilaresEmPausa.ts) */}
                  {!DIGITALIZACAO_EM_PAUSA && (
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
                  )}

                  {!BOAS_PRATICAS_EM_PAUSA && (
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
                  )}

                  {!MEMORIA_EM_PAUSA && (
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
                  )}
                </div>
                )}
              </div>
            )}

            {isResponsavel && !mostrarAvaliacao && (
              <div className="card p-6 text-center mx-auto" style={{ maxWidth: 420 }}>
                <p className="font-semibold text-gray-900 mb-4">
                  {pilarNome && !pilarEmPausa(pilarNome) ? pilarNome : 'Minhas Atribuições'}
                </p>
                <button
                  onClick={() => navigate(
                    pilarEmPausa(pilarNome) ? '/minha-parte'
                      : profile.pilar_id && pilarNome ? (PILAR_PAGE_ROUTE[pilarNome] ?? '/dashboard') : '/dashboard',
                  )}
                  className="btn-primary"
                >
                  Entrar
                </button>
              </div>
            )}

            {(isMembro || isResponsavel) && profile.pode_criar_requisicoes && profile.menu_perfil !== 'conferencia' && !mostrarAvaliacao && (
              <div className="card p-6 text-center mx-auto mb-4 border-2 border-teal-500" style={{ maxWidth: 420 }}>
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-50">
                  <Boxes size={22} className="text-teal-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Distribuição de caixas</p>
                <p className="text-xs text-gray-500 mb-4">Envie as caixas aos avaliadores, em 3 passos.</p>
                <button onClick={() => navigate('/distribuicao')} className="btn-primary">
                  Começar a distribuição
                </button>
              </div>
            )}

            {/* Perfil de menu enxuto "avaliação" (avaliadores). */}
            {mostrarAvaliacao && (
              <div className="card p-6 text-center mx-auto mb-4 border-2 border-teal-500" style={{ maxWidth: 420 }}>
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-50">
                  <ListChecks size={22} className="text-teal-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Minhas avaliações</p>
                <p className="text-xs text-gray-500 mb-4">
                  {caixasEsperando === undefined
                    ? 'Veja as caixas que chegaram e avalie os processos.'
                    : caixasEsperando === 0 && devolvidos === 0
                      ? 'Nenhuma caixa esperando você no momento.'
                      : [
                          caixasEsperando > 0 ? `${caixasEsperando} ${caixasEsperando === 1 ? 'caixa espera' : 'caixas esperam'} você` : null,
                          devolvidos > 0 ? `${devolvidos} ${devolvidos === 1 ? 'processo devolvido' : 'processos devolvidos'} para revisar` : null,
                        ].filter(Boolean).join(' · ')}
                </p>
                <button onClick={() => navigate('/minha-parte')} className="btn-primary">
                  Começar a avaliar
                </button>
              </div>
            )}

            {/* Perfil de menu enxuto "conferência" (Ariadne e Júlia). */}
            {mostrarConferencia && (
              <div className="card p-6 text-center mx-auto mb-4 border-2 border-teal-500" style={{ maxWidth: 420 }}>
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-50">
                  <ClipboardCheck size={22} className="text-teal-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Conferir avaliações</p>
                <p className="text-xs text-gray-500 mb-4">
                  {pendentesConferencia === undefined
                    ? 'Confira o código da TTD de cada processo avaliado.'
                    : pendentesConferencia === 0
                      ? 'Tudo conferido: nenhuma avaliação esperando.'
                      : `${pendentesConferencia} ${pendentesConferencia === 1 ? 'avaliação espera' : 'avaliações esperam'} a sua conferência.`}
                </p>
                <button onClick={() => navigate('/confirmar-eliminacoes')} className="btn-primary">
                  Começar a conferir
                </button>
              </div>
            )}

            {/* Perfis de menu enxuto (Distribuição, Conferência): além da tela
                principal, o ambiente de relatórios — sem "Minhas Atribuições". */}
            {(profile.menu_perfil === 'distribuicao' || mostrarConferencia || mostrarAvaliacao) && (
              <div className="card p-6 text-center mx-auto" style={{ maxWidth: 420 }}>
                <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-50">
                  <FileBarChart size={22} className="text-teal-600" />
                </div>
                <p className="font-semibold text-gray-900 mb-1">Meus relatórios</p>
                <p className="text-xs text-gray-500 mb-4">Escreva e envie o seu relatório mensal.</p>
                <button onClick={() => navigate('/central-relatorios')} className="btn-primary">
                  Ir para os relatórios
                </button>
              </div>
            )}

            {isMembro && profile.menu_perfil !== 'distribuicao' && !mostrarConferencia && !mostrarAvaliacao && (
              <div className="card p-6 text-center mx-auto" style={{ maxWidth: 420 }}>
                <p className="font-semibold text-gray-900 mb-4">
                  {pilarNome && !pilarEmPausa(pilarNome) ? `Minhas Atribuições — ${pilarNome}` : 'Minhas Atribuições'}
                </p>
                <button onClick={() => navigate('/minha-parte')} className="btn-primary">
                  Ir para Minhas Atribuições
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
