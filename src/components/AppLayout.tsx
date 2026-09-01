import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, ListTodo, ClipboardList, FileText, ShieldAlert,
  Users, Archive, BookOpen, AlertCircle, LogOut, Menu, X, ChevronDown, FolderLock, FileBarChart, FileSearch, CheckSquare, Send, Search, Clock, PackageCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Usuario } from '@/lib/database.types'
import { CDTIV_LOGO_DARKBG } from '@/assets/cdtivLogo'
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
  { to: '/confirmar-eliminacoes', label: 'Confirmar Eliminações', icon: <CheckSquare size={18} />, roles: ['coordenador','coordenador_substituto'] },
  { to: '/requisicoes-avaliacao', label: 'Requisições de Avaliação', icon: <Send size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_criar_requisicoes' },
  { to: '/conferencia-caixas', label: 'Conferência de Caixas', icon: <PackageCheck size={18} />, roles: ['coordenador','coordenador_substituto'], flag: 'pode_criar_requisicoes', novo: true },
  { to: '/demandas',    label: 'Demandas',     icon: <ClipboardList size={18} /> },
  { to: '/relatorios',  label: 'Relatórios',   icon: <FileText size={18} /> },
  { to: '/relatorios-equipe', label: 'Relatórios da Equipe', icon: <FileSearch size={18} />, roles: ['coordenador'] },
  { to: '/conformidade',label: 'Conformidade', icon: <ShieldAlert size={18} />, roles: ['coordenador','coordenador_substituto'] },
  { to: '/riscos',      label: 'Riscos',       icon: <AlertCircle size={18} /> },
  { to: '/equipe',      label: 'Equipe',       icon: <Users size={18} />, roles: ['coordenador','coordenador_substituto'] },
  { to: '/central-relatorios', label: 'Central de Relatórios', icon: <FileBarChart size={18} />, roles: ['coordenador','coordenador_substituto'] },
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

  const papel = profile?.papel ?? ''
  const isCoord = papel === 'coordenador' || papel === 'coordenador_substituto'

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
    queryKey: ['eliminacoes-pendentes-count', profile?.id, profile?.pilar_id, isCoord],
    queryFn: async () => {
      let query = supabase
        .from('avaliacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aguardando_confirmacao')
      if (!isCoord) query = query.eq('pilar_id', profile!.pilar_id)
      const { count } = await query
      return count ?? 0
    },
    enabled: !!profile?.id && isCoord,
  })

  const { data: caixasConferenciaPendentesCount } = useQuery({
    queryKey: ['caixas-conferencia-pendentes-count', profile?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('caixas')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aguardando_conferencia')
      return count ?? 0
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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.filter(isVisible).map(item => (
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
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => clsx(
                        'block px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        isActive ? 'bg-teal-500 text-white' : 'text-white/60 hover:text-white hover:bg-white/10',
                      )}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-teal-500 text-white' : 'text-white/70 hover:text-white hover:bg-white/10',
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
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
              {item.to === '/conferencia-caixas' && (caixasConferenciaPendentesCount ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {caixasConferenciaPendentesCount}
                </span>
              )}
            </NavLink>
          )
        ))}
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
