import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Archive, MapPin, CheckCircle, AlertTriangle, TrendingUp, CalendarPlus, ArrowRight, Calendar, Flag, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, formatDistanceToNow, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Pilar, Risco, ReuniaoAta, MuralEvento, TipoMuralEvento } from '@/lib/database.types'
import clsx from 'clsx'
import { PILAR_NOMES, pilarColor } from '@/lib/pilarColors'
import { HorizontalProgressChart } from '@/components/charts/HorizontalProgressChart'
import { GroupedVerticalBarChart } from '@/components/charts/GroupedVerticalBarChart'

const PILAR_PAGE_ROUTE: Record<string, string> = {
  [PILAR_NOMES.BOAS_PRATICAS]: '/pilares/boas-praticas',
  [PILAR_NOMES.MEMORIA]: '/pilares/memoria',
  [PILAR_NOMES.DIGITALIZACAO]: '/pilares/digitalizacao',
}

const REUNIAO_TIPO_LABEL: Record<string, string> = {
  mensal_consolidada: 'Mensal Consolidada',
  quinzenal_frente: 'Quinzenal por Frente',
  checkpoint_trimestral: 'Checkpoint Trimestral',
}

const MURAL_ICON: Record<TipoMuralEvento, React.ReactNode> = {
  atividade_concluida: <CheckCircle size={16} className="text-teal-600" />,
  ata_registrada: <Calendar size={16} className="text-blue-600" />,
  indicador_lancado: <TrendingUp size={16} className="text-accent-600" />,
  demanda_concluida: <Flag size={16} className="text-purple-600" />,
  fase_concluida: <Trophy size={16} className="text-yellow-600" />,
}

function muralTexto(e: MuralEvento) {
  switch (e.tipo) {
    case 'atividade_concluida': return `${e.usuario?.nome ?? '—'} concluiu "${e.descricao}"`
    case 'ata_registrada': return `${e.usuario?.nome ?? '—'} registrou uma ata`
    case 'indicador_lancado': return `${e.usuario?.nome ?? '—'} lançou os indicadores do mês`
    case 'demanda_concluida': return `${e.usuario?.nome ?? '—'} concluiu a demanda "${e.descricao}"`
    case 'fase_concluida': return `Fase "${e.descricao}" concluída pela equipe`
  }
}

function MuralEventoRow({ evento }: { evento: MuralEvento }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <div className="mt-0.5 shrink-0">{MURAL_ICON[evento.tipo]}</div>
      <div>
        <p className="text-sm text-gray-800">{muralTexto(evento)}</p>
        <p className="text-xs text-gray-400">
          {evento.pilar?.nome ?? 'CCAD'} · {formatDistanceToNow(new Date(evento.ocorrido_em), { locale: ptBR, addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={clsx('p-2.5 rounded-xl', color)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function PilarCard({ pilar }: { pilar: Pilar & { fases?: { percentual_conclusao: number }[] } }) {
  const avg = pilar.fases?.length
    ? Math.round(pilar.fases.reduce((s, f) => s + f.percentual_conclusao, 0) / pilar.fases.length)
    : 0

  const colors: Record<string, string> = {
    'Digitalização do Acervo': 'bg-teal-500',
    'Protocolo de Boas Práticas': 'bg-accent-500',
    'Espaço Memória da CDTIV': 'bg-navy-400',
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight">{pilar.nome}</h3>
        <span className="text-lg font-bold text-gray-900">{avg}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className={clsx('h-2 rounded-full transition-all', colors[pilar.nome] ?? 'bg-teal-500')}
          style={{ width: `${avg}%` }}
        />
      </div>
      {pilar.responsavel && (
        <p className="text-xs text-gray-400 mt-2">Resp: {pilar.responsavel.nome}</p>
      )}
      {PILAR_PAGE_ROUTE[pilar.nome] && (
        <Link
          to={PILAR_PAGE_ROUTE[pilar.nome]}
          className="inline-flex items-center gap-1 mt-3 text-xs text-teal-600 font-medium hover:underline"
        >
          Ver página do pilar <ArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}

function RiscoRow({ risco }: { risco: Risco }) {
  const impactColor: Record<string, string> = {
    alto: 'badge-alta', medio: 'badge-media', baixo: 'badge-baixa',
  }
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{risco.titulo}</p>
        <p className="text-xs text-gray-400">{risco.pilar?.nome ?? '—'}</p>
      </div>
      <span className={impactColor[risco.impacto]}>{risco.impacto}</span>
    </div>
  )
}

export function DashboardPage() {
  const { profile, isCoord } = useAuth()
  const mesAtual = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: indicadores } = useQuery({
    queryKey: ['indicadores-totais'],
    queryFn: async () => {
      const { data } = await supabase.from('indicadores_mensais').select('*')
      return data ?? []
    },
  })

  const { data: relatorioStats } = useQuery({
    queryKey: ['relatorio-stats', mesAtual],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('status')
        .eq('mes_referencia', mesAtual)
      const enviados = data?.filter(r => r.status === 'enviado').length ?? 0
      const atrasados = data?.filter(r => r.status === 'atrasado').length ?? 0
      const total = data?.length ?? 0
      return { enviados, atrasados, total }
    },
  })

  const { data: pilares } = useQuery({
    queryKey: ['pilares-dashboard'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('*, responsavel:responsavel_id(id,nome), fases(percentual_conclusao)')
      return (data ?? []) as (Pilar & { fases: { percentual_conclusao: number }[] })[]
    },
  })

  const { data: muralEventos } = useQuery({
    queryKey: ['mural-eventos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mural_eventos')
        .select('*, pilar:pilar_id(nome), usuario:usuario_id(nome)')
        .order('ocorrido_em', { ascending: false })
        .limit(15)
      return (data ?? []) as MuralEvento[]
    },
  })

  const { data: riscosAtivos } = useQuery({
    queryKey: ['riscos-ativos'],
    queryFn: async () => {
      const { data } = await supabase
        .from('riscos')
        .select('*, pilar:pilar_id(id,nome)')
        .eq('status', 'ativo')
        .in('impacto', ['alto', 'medio'])
        .order('impacto')
        .limit(5)
      return (data ?? []) as Risco[]
    },
  })

  const { data: demandasPendentes } = useQuery({
    queryKey: ['demandas-pendentes-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('demandas')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pendente', 'em_andamento'])
      return count ?? 0
    },
  })

  const { data: caixasCount } = useQuery({
    queryKey: ['caixas-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('caixas')
        .select('*', { count: 'exact', head: true })
      return count ?? 0
    },
  })

  const qc = useQueryClient()

  const { data: totalMembros } = useQuery({
    queryKey: ['total-membros'],
    queryFn: async () => {
      const { count } = await supabase
        .from('usuarios')
        .select('*', { count: 'exact', head: true })
        .in('papel', ['membro', 'responsavel_pilar'])
        .eq('status', 'ativo')
      return count ?? 0
    },
  })

  const ultimosMeses = Array.from({ length: 4 }, (_, i) => startOfMonth(subMonths(new Date(), 3 - i)))

  const { data: relatoriosPorMes } = useQuery({
    queryKey: ['relatorios-ultimos-4-meses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('mes_referencia, status')
        .gte('mes_referencia', format(ultimosMeses[0], 'yyyy-MM-dd'))
      return data ?? []
    },
  })

  const { data: reunioes } = useQuery({
    queryKey: ['reunioes-cadencia'],
    queryFn: async () => {
      const { data } = await supabase
        .from('reunioes_atas')
        .select('*')
        .order('data_reuniao', { ascending: false })
      return (data ?? []) as ReuniaoAta[]
    },
  })

  const [showNovaAtaMensal, setShowNovaAtaMensal] = useState(false)
  const [ataMensal, setAtaMensal] = useState({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '', encaminhado_nrh: false })

  const registrarAtaMensal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('reunioes_atas').insert({
        tipo: 'mensal_consolidada',
        pilar_id: null,
        data_reuniao: ataMensal.data_reuniao,
        resumo: ataMensal.resumo,
        encaminhado_nrh: ataMensal.encaminhado_nrh,
        criado_por: profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reunioes-cadencia'] })
      setShowNovaAtaMensal(false)
      setAtaMensal({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '', encaminhado_nrh: false })
    },
  })

  const totalCaixas = caixasCount ?? 0
  const totalPaginas = indicadores?.reduce((s, i) => s + (i.paginas_digitalizadas ?? 0), 0) ?? 0
  const totalIndexados = indicadores?.reduce((s, i) => s + (i.documentos_indexados ?? 0), 0) ?? 0

  const mesLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  const ultimaMensal = reunioes?.find(r => r.tipo === 'mensal_consolidada')
  const ultimoCheckpoint = reunioes?.find(r => r.tipo === 'checkpoint_trimestral')
  const mesAtualPrefixo = format(startOfMonth(new Date()), 'yyyy-MM')
  const quinzenaisEsteMes = (reunioes ?? []).filter(r => r.tipo === 'quinzenal_frente' && r.data_reuniao.slice(0, 7) === mesAtualPrefixo).length

  const pilaresChartData = (pilares ?? []).map(p => ({
    label: p.nome,
    value: p.fases?.length ? Math.round(p.fases.reduce((s, f) => s + f.percentual_conclusao, 0) / p.fases.length) : 0,
    color: pilarColor(p.nome),
  }))

  const relatoriosChartData = ultimosMeses.map(mes => {
    const mesStr = format(mes, 'yyyy-MM-dd')
    const enviados = (relatoriosPorMes ?? []).filter(r => r.mes_referencia === mesStr && r.status === 'enviado').length
    const label = format(mes, 'MMM', { locale: ptBR })
    return { label: label.charAt(0).toUpperCase() + label.slice(1), enviados, total: totalMembros ?? 0 }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Superpainel · Coordenação</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Olá, {profile?.nome?.split(' ')[0]}. {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Archive size={20} className="text-teal-600" />}
          label="Caixas catalogadas"
          value={totalCaixas.toLocaleString('pt-BR')}
          color="bg-teal-50"
        />
        <MetricCard
          icon={<TrendingUp size={20} className="text-accent-600" />}
          label="Páginas digitalizadas"
          value={totalPaginas.toLocaleString('pt-BR')}
          color="bg-orange-50"
        />
        <MetricCard
          icon={<MapPin size={20} className="text-blue-600" />}
          label="Documentos indexados"
          value={totalIndexados.toLocaleString('pt-BR')}
          color="bg-blue-50"
        />
        <MetricCard
          icon={<CheckCircle size={20} className="text-green-600" />}
          label="Relatórios em dia"
          value={relatorioStats ? `${relatorioStats.enviados}/${relatorioStats.total}` : '—'}
          sub={relatorioStats?.atrasados ? `${relatorioStats.atrasados} atrasado(s)` : undefined}
          color="bg-green-50"
        />
      </div>

      {/* Mural de Conquistas */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-1">Mural de Conquistas da CCAD</h2>
        <p className="text-xs text-gray-400 mb-3">Ações concluídas pela equipe nos três pilares.</p>
        {(muralEventos ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma atividade registrada ainda.</p>
        ) : (
          <div>
            {(muralEventos ?? []).map(e => <MuralEventoRow key={e.id} evento={e} />)}
          </div>
        )}
      </div>

      {/* Pilares progress */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Progresso dos Pilares</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(pilares ?? []).map(p => <PilarCard key={p.id} pilar={p} />)}
        </div>
      </div>

      {/* Cadência de reuniões */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Cadência de Reuniões</h2>
          {isCoord && (
            <button className="btn-primary text-sm" onClick={() => setShowNovaAtaMensal(v => !v)}>
              <CalendarPlus size={16} /> Nova ata mensal
            </button>
          )}
        </div>

        {isCoord && showNovaAtaMensal && (
          <div className="card p-5 mb-4 space-y-3">
            <p className="text-sm text-gray-500">Ata da Reunião Mensal Consolidada (cobre os 3 pilares).</p>
            <div>
              <label className="label">Data da reunião</label>
              <input type="date" className="input" value={ataMensal.data_reuniao} onChange={e => setAtaMensal(v => ({ ...v, data_reuniao: e.target.value }))} />
            </div>
            <div>
              <label className="label">Resumo</label>
              <textarea className="input min-h-[80px] resize-y" value={ataMensal.resumo} onChange={e => setAtaMensal(v => ({ ...v, resumo: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ataMensal.encaminhado_nrh}
                onChange={e => setAtaMensal(v => ({ ...v, encaminhado_nrh: e.target.checked }))}
              />
              <span className="text-sm text-yellow-800 font-medium">
                Encaminhado ao NRH (obrigatório — Art. 3º Portaria 026/2026)
              </span>
            </label>
            <div className="flex gap-2">
              <button className="btn-primary text-sm" disabled={registrarAtaMensal.isPending} onClick={() => registrarAtaMensal.mutate()}>Salvar ata</button>
              <button className="btn-secondary text-sm" onClick={() => setShowNovaAtaMensal(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-400">{REUNIAO_TIPO_LABEL.mensal_consolidada}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">
              {ultimaMensal ? format(new Date(ultimaMensal.data_reuniao), 'dd/MM/yyyy') : 'Nenhuma registrada'}
            </p>
            {ultimaMensal && (
              <span className={clsx(
                'inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium',
                ultimaMensal.encaminhado_nrh ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
              )}>
                {ultimaMensal.encaminhado_nrh ? 'Encaminhado ao NRH' : 'Não encaminhado ao NRH'}
              </span>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-400">{REUNIAO_TIPO_LABEL.quinzenal_frente}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{quinzenaisEsteMes} este mês</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-400">{REUNIAO_TIPO_LABEL.checkpoint_trimestral}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">
              {ultimoCheckpoint ? format(new Date(ultimoCheckpoint.data_reuniao), 'dd/MM/yyyy') : 'Nenhum registrado'}
            </p>
          </div>
        </div>
      </div>

      {/* Gráficos gerenciais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">% Concluído por Pilar</h2>
          <HorizontalProgressChart
            ariaLabel={`Percentual concluído por pilar: ${pilaresChartData.map(p => `${p.label} ${p.value}%`).join(', ')}`}
            data={pilaresChartData}
          />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Relatórios Enviados em Dia (últimos 4 meses)</h2>
          <GroupedVerticalBarChart
            ariaLabel={`Relatórios enviados em dia nos últimos 4 meses frente ao total de membros: ${relatoriosChartData.map(r => `${r.label} ${r.enviados} de ${r.total}`).join(', ')}`}
            data={relatoriosChartData}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demandas resumo */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Demandas Ativas</h2>
            <span className="text-2xl font-bold text-accent-500">{demandasPendentes}</span>
          </div>
          <p className="text-sm text-gray-500">
            Demandas pendentes ou em andamento aguardando execução.
          </p>
          <a href="/demandas" className="inline-block mt-3 text-sm text-teal-600 font-medium hover:underline">
            Ver todas →
          </a>
        </div>

        {/* Riscos */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-accent-500" />
            <h2 className="font-semibold text-gray-900">Riscos em Destaque</h2>
          </div>
          {(riscosAtivos ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum risco ativo de alto/médio impacto.</p>
          ) : (
            <div>
              {(riscosAtivos ?? []).map(r => <RiscoRow key={r.id} risco={r} />)}
            </div>
          )}
          <a href="/riscos" className="inline-block mt-2 text-sm text-teal-600 font-medium hover:underline">
            Ver matriz de riscos →
          </a>
        </div>
      </div>

      {/* Relatórios conformidade strip */}
      {(relatorioStats?.atrasados ?? 0) > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              {relatorioStats!.atrasados} membro(s) com relatório atrasado este mês.
            </p>
            <a href="/conformidade" className="text-sm text-red-600 hover:underline">Ver painel de conformidade →</a>
          </div>
        </div>
      )}
    </div>
  )
}
