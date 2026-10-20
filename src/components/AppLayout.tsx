import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, ListTodo, ClipboardList, ShieldAlert,
  Users, Archive, BookOpen, AlertCircle, LogOut, Menu, X, ChevronDown, FolderLock, FileBarChart, CheckSquare, Send, Search, Clock, PackageCheck, FileSignature, Workflow, Star,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Usuario } from '@/lib/database.types'
import { CDTIV_LOGO_DARKBG } from '@/assets/cdtivLogo'
import { AlertaRitmoAvaliacao } from '@/components/AlertaRitmoAvaliacao'
import { AlertaAvaliacaoPessoal } from '@/components/AlertaAvaliacaoPessoal'
import { correspondeBusca } from '@/lib/textSearch'
import clsx from 'clsx'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  roles?: string[]
  flag?: keyof Usuario
  novo?: boolean
  children?: { to: string; label: string }[]
}

// Item "achatado" do menu, usado na busca e nos favoritos — tanto itens de
// primeiro nível quanto cada filho de um grupo (ex. "Tabela TTD" dentro de
// "Acervo") viram um item navegável único, independente de onde estejam
// aninhados. `group`/`groupTo` só existem para um item que é filho de um
// grupo, e servem para mostrar "em Acervo" no resultado da busca e para
// abrir automaticamente o grupo certo ao navegar por um favorito/resultado.
interface FlatNavItem {
  to: string
  label: string
  icon: React.ReactNode
  group?: string
  groupTo?: string
}

function buildFlatNav(visibleNav: NavItem[]): FlatNavItem[] {
  const out: FlatNavItem[] = []
  for (const item of visibleNav) {
    if (item.children) {
      for (const child of item.children) {
        out.push({ to: child.to, label: child.label, icon: item.icon, group: item.label, groupTo: item.to })
      }
    } else {
      out.push({ to: item.to, label: item.label, icon: item.icon })
    }
  }
  return out
}

const NAV: NavItem[] = [
  { to: '/dashboard',   label: 'Dashboard',   icon: <LayoutDashboard size={18} />, roles: ['coordenador','coordenador_substituto','apoio_tecnico'] },
  {
    to: '/busca-processos', label: 'Buscar Processo', icon: <Search size={18} />,
    roles: ['coordenador', 'coordenador_substituto'], flag: 'acesso_busca_emprestimos',
  },
  {
    to: '/painel-emprestimos', label: 'Painel de Empréstimos', icon: <Clock size={18} />,
    roles: ['coordenador', 'coordenador_substituto'], flag: 'acesso_busca_emprestimos', novo: true,
  },
  { to: '/minha-parte', label: 'Minhas Atribuições',  icon: <ListTodo size={18} />, roles: ['membro','responsavel_pilar','coordenador','coordenador_substituto'] },
  { to: '/confirmar-eliminacoes', label: 'Confirmar Eliminações', icon: <CheckSquare size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_confirmar_eliminacoes' },
  { to: '/requisicoes-avaliacao', label: 'Requisições de Avaliação', icon: <Send size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_criar_requisicoes' },
  { to: '/conferencia-caixas', label: 'Conferência de Caixas', icon: <PackageCheck size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_criar_requisicoes', novo: true },
  { to: '/fluxo-caixas', label: 'Fluxo das Caixas', icon: <Workflow size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_criar_requisicoes', novo: true },
  { to: '/demandas',    label: 'Demandas',     icon: <ClipboardList size={18} /> },
  // Sem "roles": item visível a todos — dentro dele, a aba "Meus Relatórios
  // Mensais" é aberta a qualquer um, e "Relatórios da Equipe"/"Relatórios
  // Diversos" só aparecem para quem já é Coordenação (lógica na própria página).
  { to: '/central-relatorios', label: 'Central de Relatórios', icon: <FileBarChart size={18} /> },
  { to: '/conformidade',label: 'Conformidade', icon: <ShieldAlert size={18} />, roles: ['coordenador','coordenador_substituto'] },
  { to: '/riscos',      label: 'Riscos',       icon: <AlertCircle size={18} /> },
  { to: '/equipe',      label: 'Equipe',       icon: <Users size={18} />, roles: ['coordenador','coordenador_substituto'] },
  { to: '/cepas-crpas', label: 'CEPAs e CRPAs', icon: <FileSignature size={18} />, roles: ['coordenador','coordenador_substituto'], novo: true },
  {
    to: '/acervo', label: 'Acervo', icon: <Archive size={18} />,
    roles: ['coordenador', 'coordenador_substituto'],
    children: [
      { to: '/acervo',           label: 'Visão Geral' },
      { to: '/acervo/catalogar', label: 'Catalogar Processo' },
      { to: '/acervo/ttd',       label: 'Tabela TTD' },
      { to: '/acervo/revisao',   label: 'Fila de Revisão' },
    ],
  },
  {
    to: '/protocolo-geral', label: 'Protocolo Geral', icon: <FolderLock size={18} />,
    flag: 'acesso_protocolo_geral',
    children: [
      { to: '/protocolo-geral',           label: 'Visão Geral' },
      { to: '/protocolo-geral/catalogar', label: 'Catalogar Processo' },
      { to: '/protocolo-geral/ttd',       label: 'Tabela TTD' },
      { to: '/protocolo-geral/revisao',   label: 'Fila de Revisão' },
    ],
  },
]

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  // Favoritos do menu (pedido do Sérgio, 20/10/2026 — ver
  // claude/portal-ccad-notas.md, seção "Design System do Portal"): cada
  // pessoa fixa as telas que mais usa no topo do menu, mesmo as que ficam
  // escondidas dentro de um submenu (ex. "Tabela TTD" dentro de "Acervo").
  // Guardado no navegador (localStorage), por usuário — é só uma
  // preferência pessoal de atalho, não precisa de tabela nova no banco.
  const [favoritos, setFavoritos] = useState<string[]>([])
  useEffect(() => {
    if (!profile?.id) return
    try {
      const raw = localStorage.getItem(`ccad-favoritos-${profile.id}`)
      setFavoritos(raw ? JSON.parse(raw) : [])
    } catch {
      setFavoritos([])
    }
  }, [profile?.id])

  function toggleFavorito(to: string) {
    setFavoritos(prev => {
      const next = prev.includes(to) ? prev.filter(x => x !== to) : [...prev, to]
      try {
        if (profile?.id) localStorage.setItem(`ccad-favoritos-${profile.id}`, JSON.stringify(next))
      } catch {
        // localStorage pode falhar (navegação privada, bloqueio) — favoritos
        // seguem funcionando só nesta sessão da página, sem persistir.
      }
      return next
    })
  }

  const papel = profile?.papel ?? ''
  const isCoord = papel === 'coordenador' || papel === 'coordenador_substituto'
  // Quem tem a permissão individual `pode_confirmar_eliminacoes` (ex.: Ariadne)
  // enxerga a fila de eliminações inteira, igual ao Coordenador — não só a do
  // próprio pilar — porque ela faz essa conferência para o Coordenador, não
  // só pela sua própria área.
  const podeConfirmarEliminacoes = isCoord || profile?.pode_confirmar_eliminacoes === true

  const { data: demandasPendentesCount } = useQuery({
    queryKey: ['demandas-pendentes-count', profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('demandas')
        .select('*', { count: 'exact', head: true })
        .eq('responsavel_pilar_id', profile!.id)
        .in('status', ['pendente', 'em_andamento'])
      return count ?? 0
    },
    enabled: !!profile?.id,
  })

  const { data: eliminacoesPendentesCount } = useQuery({
    queryKey: ['eliminacoes-pendentes-count', profile?.id, profile?.pilar_id, podeConfirmarEliminacoes],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aguardando_confirmacao')
      if (!podeConfirmarEliminacoes) query = query.eq('pilar_id', profile!.pilar_id)
      const { count } = await query
      return count ?? 0
    },
    enabled: !!profile?.id && podeConfirmarEliminacoes,
  })

  // Caixas finais por setor (10/10/2026, ver
  // claude/plano-caixas-finais-poco-setor.md): a bolinha do menu agora
  // avisa quantos POÇOS de arquivamento já atingiram o volume mínimo
  // configurado (não mais "quantas caixas de entrada estão esperando
  // conferência" — isso deixou de existir como ação pendente, já que a
  // distribuição para os poços acontece sozinha).
  const { data: pocosArquivamentoProntosCount } = useQuery({
    queryKey: ['pocos-arquivamento-prontos-count', profile?.id],
    queryFn: async () => {
      const [{ data: pocos }, { data: config }] = await Promise.all([
        supabase
          .from('caixas')
          .select('destinacao, processos!caixa_final_id(id)')
          .eq('tipo', 'final')
          .eq('status', 'em_construcao'),
        supabase.from('config_arquivamento_final').select('*').eq('id', true).maybeSingle(),
      ])
      if (!pocos || !config) return 0
      return pocos.filter((p: any) => {
        const total = p.processos?.length ?? 0
        const minimo =
          p.destinacao === 'eliminacao' ? config.quantidade_minima_eliminacao : config.quantidade_minima_guarda_permanente
        return total >= minimo
      }).length
    },
    enabled: !!profile?.id && (isCoord || profile?.pode_criar_requisicoes === true),
  })

  function isVisible(item: NavItem) {
    const roleOk = item.roles ? item.roles.includes(papel) : false
    const flagOk = item.flag ? profile?.[item.flag] === true : false
    if (item.roles && item.flag) return roleOk || flagOk
    if (item.flag) return flagOk
    if (item.roles) return roleOk
    return true
  }

  const visibleNav = NAV.filter(isVisible)
  const flatNav = buildFlatNav(visibleNav)
  // Busca tolerante a acento/plural (mesma lib usada na TTD e em outras
  // buscas do sistema — ver src/lib/textSearch.ts). Também considera o
  // nome do grupo ("Acervo"), então buscar "acervo" já lista tudo que mora
  // lá dentro, não só o nome exato da tela.
  const searchResults = search.trim()
    ? flatNav.filter(i => correspondeBusca(`${i.label} ${i.group ?? ''}`, search))
    : []

  function abrirItem(i: FlatNavItem) {
    setOpen(false)
    setSearch('')
    if (i.groupTo) setExpanded(v => ({ ...v, [i.groupTo as string]: true }))
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const PapelBadge = () => {
    const labels: Record<string, string> = {
      coordenador: 'Coordenador',
      coordenador_substituto: 'Coord. Substituto',
      responsavel_pilar: 'Resp. Pilar',
      membro: 'Membro',
      apoio_tecnico: 'Apoio Técnico',
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
        {labels[papel] ?? papel}
      </span>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <BookOpen size={24} className="text-teal-400 shrink-0" />
          <p className="font-bold text-white leading-tight">CCAD</p>
        </div>
        <img src={CDTIV_LOGO_DARKBG} alt="CDTIV" className="h-7 w-auto shrink-0" />
      </div>

      {/* Busca de telas (pedido do Sérgio, 20/10/2026) — digite o nome de
          qualquer tela e ela aparece na hora, mesmo escondida dentro de um
          submenu como "Acervo". */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tela…"
            className="w-full bg-white/95 border border-white/20 rounded-lg pl-8 pr-7 py-1.5 text-xs text-navy-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-600"
              title="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
        {search.trim() ? (
          // Resultados da busca — lista achatada, mostra "em <grupo>" para
          // os itens que moram dentro de um submenu.
          searchResults.length === 0 ? (
            <p className="px-3 py-3 text-xs text-white/40">Nenhuma tela encontrada para "{search}".</p>
          ) : (
            searchResults.map(i => (
              <NavLink
                key={i.to}
                to={i.to}
                end
                onClick={() => abrirItem(i)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                  isActive
                    ? 'bg-teal-500 text-white border-teal-400'
                    : 'bg-teal-500/15 text-white border-teal-500/30 hover:bg-teal-500/25',
                )}
              >
                {i.icon}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{i.label}</span>
                  {i.group && <span className="block text-[10px] font-normal text-teal-300">em {i.group}</span>}
                </span>
              </NavLink>
            ))
          )
        ) : (
          <>
            {/* Favoritos — telas fixadas pela própria pessoa, mesmo as que
                moram dentro de um submenu. Guardado no navegador, por
                usuário (ver toggleFavorito acima). */}
            {favoritos.length > 0 && (
              <div className="mb-2 pb-2 border-b border-white/10 space-y-0.5">
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-white/35">Favoritos</p>
                {favoritos
                  .map(to => flatNav.find(i => i.to === to))
                  .filter((i): i is FlatNavItem => !!i)
                  .map(i => (
                    <div key={i.to} className="flex items-center gap-1">
                      <NavLink
                        to={i.to}
                        end
                        onClick={() => abrirItem(i)}
                        className={({ isActive }) => clsx(
                          'flex-1 min-w-0 flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          isActive ? 'bg-teal-500 text-white' : 'text-white/80 hover:text-white hover:bg-white/10',
                        )}
                      >
                        {i.icon}
                        <span className="flex-1 truncate">{i.label}</span>
                      </NavLink>
                      <button
                        onClick={() => toggleFavorito(i.to)}
                        className="p-1.5 text-amber-400 hover:text-amber-300 shrink-0"
                        title="Remover dos favoritos"
                      >
                        <Star size={13} fill="currentColor" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {visibleNav.map(item => (
              item.children ? (
                <div key={item.to}>
                  <button
                    onClick={() => setExpanded(v => ({ ...v, [item.to]: !v[item.to] }))}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      'text-white/70 hover:text-white hover:bg-white/10',
                    )}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown size={14} className={clsx('transition-transform', expanded[item.to] && 'rotate-180')} />
                  </button>
                  {expanded[item.to] && (
                    <div className="ml-6 mt-0.5 space-y-0.5">
                      {item.children.map(child => (
                        <div key={child.to} className="flex items-center gap-1">
                          <NavLink
                            to={child.to}
                            end
                            onClick={() => setOpen(false)}
                            className={({ isActive }) => clsx(
                              'flex-1 min-w-0 block px-3 py-1.5 rounded-lg text-xs font-medium transition-colors truncate',
                              isActive ? 'bg-teal-500 text-white' : 'text-white/60 hover:text-white hover:bg-white/10',
                            )}
                          >
                            {child.label}
                          </NavLink>
                          <button
                            onClick={() => toggleFavorito(child.to)}
                            className={clsx(
                              'p-1 rounded-md transition-colors shrink-0',
                              favoritos.includes(child.to) ? 'text-amber-400' : 'text-white/20 hover:text-white/50',
                            )}
                            title={favoritos.includes(child.to) ? 'Remover dos favoritos' : 'Fixar nos favoritos'}
                          >
                            <Star size={11} fill={favoritos.includes(child.to) ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={item.to} className="flex items-center gap-1">
                  <NavLink
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => clsx(
                      'flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive ? 'bg-teal-500 text-white' : 'text-white/70 hover:text-white hover:bg-white/10',
                    )}
                  >
                    {item.icon}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.novo && (
                      <span className="bg-teal-400 text-navy-700 text-[9px] font-bold tracking-wide rounded-full px-1.5 py-0.5">
                        NOVO
                      </span>
                    )}
                    {item.to === '/demandas' && (demandasPendentesCount ?? 0) > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {demandasPendentesCount}
                      </span>
                    )}
                    {item.to === '/confirmar-eliminacoes' && (eliminacoesPendentesCount ?? 0) > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {eliminacoesPendentesCount}
                      </span>
                    )}
                    {item.to === '/conferencia-caixas' && (pocosArquivamentoProntosCount ?? 0) > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {pocosArquivamentoProntosCount}
                      </span>
                    )}
                  </NavLink>
                  <button
                    onClick={() => toggleFavorito(item.to)}
                    className={clsx(
                      'p-1.5 rounded-md transition-colors shrink-0',
                      favoritos.includes(item.to) ? 'text-amber-400' : 'text-white/25 hover:text-white/60',
                    )}
                    title={favoritos.includes(item.to) ? 'Remover dos favoritos' : 'Fixar nos favoritos'}
                  >
                    <Star size={13} fill={favoritos.includes(item.to) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              )
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {profile?.nome?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.nome ?? '—'}</p>
            <PapelBadge />
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-navy-600 flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative w-60 h-full bg-navy-600 z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-navy-600 border-b border-white/10">
          <button onClick={() => setOpen(true)} className="text-white">
            <Menu size={20} />
          </button>
          <span className="text-white font-semibold">CCAD</span>
          <button onClick={() => setOpen(false)} className="ml-auto text-white/60 hidden">
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Alerta de Ritmo de Avaliação (claude/plano-alerta-ritmo-avaliacoes.md)
              — fica aqui, acima de qualquer página, para aparecer "toda vez
              que o Sérgio abrir o sistema" como ele pediu, e não só dentro
              do Dashboard. Só ele decide se aparece (isCoord, dentro do
              próprio componente) e se já foi visto hoje. */}
          <AlertaRitmoAvaliacao />
          {/* Lembrete pessoal de avaliação (pedido do Sérgio, 02/10/2026) —
              mostrado ao próprio membro avaliador (não ao Coordenador),
              quando ele mesmo está há 15 dias ou mais sem avaliar nenhum
              processo. Ver src/components/AlertaAvaliacaoPessoal.tsx. */}
          <AlertaAvaliacaoPessoal />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
