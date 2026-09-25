import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Archive, MapPin, CheckCircle, AlertTriangle, TrendingUp, CalendarPlus, ArrowRight, Calendar, Flag, Trophy, PackageCheck, ClipboardList, LayoutGrid, Construction } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, formatDistanceToNow, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Pilar, Risco, ReuniaoAta, MuralEvento, TipoMuralEvento, StatusCaixa } from '@/lib/database.types'
import clsx from 'clsx'
import { PILAR_NOMES, pilarColor } from '@/lib/pilarColors'
import { HorizontalProgressChart } from '@/components/charts/HorizontalProgressChart'
import { GroupedVerticalBarChart } from '@/components/charts/GroupedVerticalBarChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { buscarDesempenhoAvaliadores } from '@/lib/desempenhoAvaliadores'

const PILAR_PAGE_ROUTE: Record<string, string> = {
  [PILAR_NOMES.BOAS_PRATICAS]: '/pilares/boas-praticas',
  [PILAR_NOMES.MEMORIA]: '/pilares/memoria',
  [PILAR_NOMES.DIGITALIZACAO]: '/pilares/digitalizacao',
}

// Ordem e rótulo de cada etapa do ciclo de vida de uma caixa — ver
// ciclo-avaliacao-caixas-fase14.md no projeto Claude.
const CAIXA_STATUS_ORDEM: StatusCaixa[] = ['catalogada', 'em_avaliacao', 'aguardando_conferencia', 'arquivada']
const CAIXA_STATUS_LABEL: Record<StatusCaixa, string> = {
  catalogada: 'Catalogada',
  em_avaliacao: 'Em avaliação',
  aguardando_conferencia: 'Aguardando conferência',
  arquivada: 'Arquivada',
}

// Cor da barra de progresso por avaliador, de acordo com o % concluído —
// só um sinal visual rápido de quem precisa de mais atenção da Coordenação.
function corDesempenho(percentual: number) {
  if (percentual < 40) return '#ef4444' // vermelho
  if (percentual < 75) return '#f59e0b' // âmbar
  return '#14b8a6' // teal
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
  caixa_arquivada: <PackageCheck size={16} className="text-navy-600" />,
}

function muralTexto(e: MuralEvento) {
  switch (e.tipo) {
    case 'atividade_concluida': return `${e.usuario?.nome ?? '—'} concluiu "${e.descricao}"`
    case 'ata_registrada': return `${e.usuario?.nome ?? '—'} registrou uma ata`
    case 'indicador_lancado': return `${e.usuario?.nome ?? '—'} lançou os indicadores do mês`
    case 'demanda_concluida': return `${e.usuario?.nome ?? '—'} concluiu a demanda "${e.descricao}"`
    case 'fase_concluida': return `Fase "${e.descricao}" concluída pela equipe`
    case 'caixa_arquivada': return `${e.usuario?.nome ?? 'Protocolo'} conferiu e arquivou a caixa ${e.descricao} no Arquivo Geral`
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

// Abas do Dashboard — Etapa 1 do plano "Acompanhamento de Avaliações no
// Dashboard" (ver claude/plano-dashboard-acompanhamento-avaliacoes.md no
// projeto Claude). Por enquanto só reorganiza o que já existia em "Visão
// Geral" e abre espaço para a aba "Avaliações", preenchida nas próximas
// etapas. Nenhum dado ou comportamento da Visão Geral muda nesta etapa.
type AbaDashboard = 'geral' | 'avaliacoes'

export function DashboardPage() {
  const { profile, isCoord } = useAuth()
  const location = useLocation()
  // Permite abrir direto na aba "Avaliações" vindo de outro lugar do
  // sistema (ex.: o Alerta de Ritmo de Avaliação no topo das páginas —
  // claude/plano-alerta-ritmo-avaliacoes.md), sem o Sérgio precisar clicar
  // na aba manualmente. Mesmo padrão já usado em CentralRelatoriosPage.tsx.
  const abaInicial = (location.state as { aba?: AbaDashboard } | null)?.aba
  const [aba, setAba] = useState<AbaDashboard>(abaInicial === 'avaliacoes' ? 'avaliacoes' : 'geral')
  const mesAtual = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  // Etapa 5 do plano de Acompanhamento de Avaliações: filtro de período
  // para a aba "Avaliações". Por padrão mostra o acumulado desde o início
  // (sem filtro nenhum — igual ao que já existia nas Etapas 2 e 4). O
  // filtro atua sobre `data_entrega` de `requisicoes_avaliacao` (a data em
  // que a caixa chegou fisicamente e foi enviada para avaliação) — ou
  // seja, "período" aqui significa "caixas entregues nesse intervalo", e
  // os números de processos/avaliações seguem naturalmente essas caixas,
  // reaproveitando toda a lógica que já existe nas Etapas 2 e 4.
  type PeriodoFiltro = 'total' | 'mes' | 'personalizado'
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('total')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')
  const periodoRange: { inicio: string; fim: string | null } | null =
    periodoFiltro === 'mes'
      ? { inicio: mesAtual, fim: null }
      : periodoFiltro === 'personalizado' && periodoInicio && periodoFim
      ? { inicio: periodoInicio, fim: periodoFim }
      : null

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

  // Aba "Avaliações" — Etapa 2 do plano (ver
  // plano-dashboard-acompanhamento-avaliacoes.md): resumo geral de quantas
  // caixas o Protocolo já distribuiu para avaliação e como está o andamento.
  // Só carrega quando a aba está aberta e só para quem já vê o Dashboard
  // completo (Coordenação) — mesma regra combinada com o Sérgio.
  const { data: resumoAvaliacoes, isLoading: carregandoResumoAvaliacoes } = useQuery({
    queryKey: ['dashboard-avaliacoes-resumo', periodoRange],
    queryFn: async () => {
      // 1) Cada requisição de avaliação não cancelada é uma caixa que o
      // Protocolo efetivamente entregou a um avaliador. Quando há um
      // período selecionado (Etapa 5), restringimos pela data de entrega
      // da caixa — o resto da consulta (processos, avaliações, %) segue
      // naturalmente essas mesmas caixas, sem precisar mudar mais nada.
      let requisicoesQuery = supabase
        .from('requisicoes_avaliacao')
        .select('status, caixa_id')
        .in('status', ['pendente', 'concluida'])
      if (periodoRange) requisicoesQuery = requisicoesQuery.gte('data_entrega', periodoRange.inicio)
      if (periodoRange?.fim) requisicoesQuery = requisicoesQuery.lte('data_entrega', periodoRange.fim)
      const { data: requisicoes } = await requisicoesQuery

      const listaRequisicoes = requisicoes ?? []
      const caixaIds = Array.from(new Set(listaRequisicoes.map(r => r.caixa_id)))
      const pendentes = listaRequisicoes.filter(r => r.status === 'pendente').length
      const concluidas = listaRequisicoes.filter(r => r.status === 'concluida').length

      // 2) Quantos processos existem, ao todo, nessas caixas.
      let totalProcessos = 0
      if (caixaIds.length > 0) {
        const { count } = await supabase
          .from('processos')
          .select('*', { count: 'exact', head: true })
          .in('caixa_id', caixaIds)
        totalProcessos = count ?? 0
      }

      // 3) Quantos desses processos já têm uma avaliação válida registrada
      // (confirmada ou aguardando confirmação) — avaliação devolvida e
      // ainda não corrigida não conta como concluída (decisão registrada
      // no plano: reflete o trabalho realmente já fechado).
      let processosAvaliados = 0
      if (caixaIds.length > 0) {
        const { count } = await supabase
          .from('avaliacoes')
          .select('processo:processo_id!inner(caixa_id)', { count: 'exact', head: true })
          .in('processo.caixa_id', caixaIds)
          .in('status', ['confirmada', 'aguardando_confirmacao'])
        processosAvaliados = count ?? 0
      }

      // 4) Panorama de todas as caixas do sistema por etapa do ciclo
      // (independente de terem ou não requisição de avaliação digital —
      // inclui também o acervo histórico já migrado).
      const porStatus = await Promise.all(
        CAIXA_STATUS_ORDEM.map(async status => {
          const { count } = await supabase.from('caixas').select('*', { count: 'exact', head: true }).eq('status', status)
          return { status, count: count ?? 0 }
        })
      )

      return { caixasDistribuidas: caixaIds.length, pendentes, concluidas, totalProcessos, processosAvaliados, porStatus }
    },
    enabled: isCoord && aba === 'avaliacoes',
  })

  // Aba "Avaliações" — Etapa 4 do plano: quanto cada avaliador habilitado
  // tem sob responsabilidade e quanto já avaliou. Só para Coordenação (ver
  // decisão de visibilidade no plano) — é dado de desempenho individual.
  //
  // A conta em si (pares avaliador/caixa, contagem sem corte de 1.000 linhas
  // etc.) foi extraída para `buscarDesempenhoAvaliadores`
  // (src/lib/desempenhoAvaliadores.ts) na Etapa 1 do plano em
  // claude/plano-alerta-ritmo-avaliacoes.md, para ser reaproveitada também
  // pelo Alerta de Ritmo de Avaliação, sem duplicar essa lógica sensível a
  // bugs em dois lugares.
  const { data: desempenhoAvaliadores, isLoading: carregandoDesempenho } = useQuery({
    queryKey: ['dashboard-desempenho-avaliadores', periodoRange],
    queryFn: () => buscarDesempenhoAvaliadores(periodoRange),
    enabled: isCoord && aba === 'avaliacoes',
  })

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
        <h1 className="text-2xl font-bold text-gray-900">
          {isCoord ? 'Superpainel · Coordenação' : 'Superpainel'}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Olá, {profile?.nome?.split(' ')[0]}. {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}.
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setAba('geral')}
          className={clsx(
            'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            aba === 'geral' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <LayoutGrid size={15} /> Visão Geral
        </button>
        <button
          type="button"
          onClick={() => setAba('avaliacoes')}
          className={clsx(
            'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            aba === 'avaliacoes' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <ClipboardList size={15} /> Avaliações
        </button>
      </div>

      {aba === 'geral' && (
      <div className="space-y-8">
      {/* Metric cards — Etapa 6 do plano: antes esse bloco não tinha
          nenhum título, ficando "solto" no topo da página (era um dos
          motivos da sensação de "poluído" que o Sérgio apontou). Agora
          tem cabeçalho e legenda, igual aos demais blocos da página. */}
      {isCoord && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Indicadores Institucionais</h2>
          <p className="text-xs text-gray-400 mb-3">Totais combinados dos três pilares (Digitalização, Boas Práticas e Memória).</p>
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
              sub={
                relatorioStats
                  ? relatorioStats.atrasados
                    ? `${relatorioStats.enviados} de ${relatorioStats.total} enviados · ${relatorioStats.atrasados} atrasado(s)`
                    : `${relatorioStats.enviados} de ${relatorioStats.total} membros entregaram este mês`
                  : undefined
              }
              color="bg-green-50"
            />
          </div>
        </div>
      )}

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
      {isCoord && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Cadência de Reuniões</h2>
            <button className="btn-primary text-sm" onClick={() => setShowNovaAtaMensal(v => !v)}>
              <CalendarPlus size={16} /> Nova ata mensal
            </button>
          </div>

          {showNovaAtaMensal && (
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
      )}

      {/* Gráficos gerenciais */}
      {isCoord && (
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
      )}

      {isCoord && (
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
      )}

      {/* Relatórios conformidade strip */}
      {isCoord && (relatorioStats?.atrasados ?? 0) > 0 && (
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
      )}

      {aba === 'avaliacoes' && (
        !isCoord ? (
          <div className="card p-8 text-center text-sm text-gray-500">
            Painel de acompanhamento de avaliações disponível para a Coordenação.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Acompanhamento de Avaliações</h2>
                <p className="text-xs text-gray-400">
                  Caixas distribuídas pelo Protocolo para avaliação e o andamento da classificação dos processos.
                </p>
                {periodoRange && (
                  <p className="text-xs text-teal-700 font-medium mt-1">
                    Período: {format(new Date(`${periodoRange.inicio}T00:00:00`), "dd/MM/yyyy", { locale: ptBR })}
                    {' '}até{' '}
                    {periodoRange.fim
                      ? format(new Date(`${periodoRange.fim}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR })
                      : 'hoje'}
                  </p>
                )}
              </div>

              {/* Etapa 5 do plano: filtro de período. Por padrão mostra o
                  acumulado desde o início (sem filtro); "Este mês" e
                  "Período" recalculam os números considerando só as caixas
                  entregues naquele intervalo. */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
                  {([
                    { key: 'total', label: 'Desde o início' },
                    { key: 'mes', label: 'Este mês' },
                    { key: 'personalizado', label: 'Período' },
                  ] as { key: PeriodoFiltro; label: string }[]).map(opcao => (
                    <button
                      key={opcao.key}
                      type="button"
                      onClick={() => setPeriodoFiltro(opcao.key)}
                      className={clsx(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-colors',
                        periodoFiltro === opcao.key ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >
                      {opcao.key === 'personalizado' && <Calendar size={13} />}
                      {opcao.label}
                    </button>
                  ))}
                </div>
                {periodoFiltro === 'personalizado' && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="date"
                      value={periodoInicio}
                      onChange={e => setPeriodoInicio(e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs"
                      aria-label="Data inicial do período"
                    />
                    <span>até</span>
                    <input
                      type="date"
                      value={periodoFim}
                      onChange={e => setPeriodoFim(e.target.value)}
                      min={periodoInicio || undefined}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs"
                      aria-label="Data final do período"
                    />
                    {!(periodoInicio && periodoFim) && (
                      <span className="text-gray-400 italic">escolha as duas datas</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {carregandoResumoAvaliacoes ? (
              <p className="text-center py-10 text-gray-400 text-sm">Carregando…</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard
                    icon={<PackageCheck size={20} className="text-navy-600" />}
                    label="Caixas distribuídas"
                    value={(resumoAvaliacoes?.caixasDistribuidas ?? 0).toLocaleString('pt-BR')}
                    sub={
                      resumoAvaliacoes
                        ? `${resumoAvaliacoes.pendentes} em avaliação · ${resumoAvaliacoes.concluidas} concluída(s)`
                        : undefined
                    }
                    color="bg-navy-50"
                  />
                  <MetricCard
                    icon={<Archive size={20} className="text-teal-600" />}
                    label="Processos nessas caixas"
                    value={(resumoAvaliacoes?.totalProcessos ?? 0).toLocaleString('pt-BR')}
                    color="bg-teal-50"
                  />
                  <MetricCard
                    icon={<CheckCircle size={20} className="text-green-600" />}
                    label="Processos já avaliados"
                    value={(resumoAvaliacoes?.processosAvaliados ?? 0).toLocaleString('pt-BR')}
                    sub={
                      resumoAvaliacoes && resumoAvaliacoes.totalProcessos > 0
                        ? `${Math.round((resumoAvaliacoes.processosAvaliados / resumoAvaliacoes.totalProcessos) * 100)}% do total distribuído`
                        : undefined
                    }
                    color="bg-green-50"
                  />
                </div>

                {/* Etapa 3 do plano: gráfico de rosca com o % geral avaliado
                    (processos avaliados vs. ainda pendentes), para dar o
                    efeito visual "bonito com percentual" pedido pelo
                    Sérgio. Os dois números somados aqui já vêm calculados
                    acima, então não precisa de nenhuma consulta nova. */}
                {resumoAvaliacoes && resumoAvaliacoes.totalProcessos > 0 && (
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Progresso geral de avaliação</h3>
                    <p className="text-xs text-gray-400 mb-4">
                      Percentual de processos já avaliados, considerando todas as caixas distribuídas.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <DonutChart
                        ariaLabel={`${Math.round((resumoAvaliacoes.processosAvaliados / resumoAvaliacoes.totalProcessos) * 100)}% dos processos já avaliados, ${resumoAvaliacoes.processosAvaliados} de ${resumoAvaliacoes.totalProcessos}`}
                        centerLabel="processos no total"
                        data={[
                          { label: 'Avaliados', value: resumoAvaliacoes.processosAvaliados, color: '#16a34a' },
                          { label: 'Pendentes', value: resumoAvaliacoes.totalProcessos - resumoAvaliacoes.processosAvaliados, color: '#d1d5db' },
                        ]}
                      />
                      <div className="text-center sm:text-left">
                        <p className="text-4xl font-bold text-green-600 leading-none">
                          {Math.round((resumoAvaliacoes.processosAvaliados / resumoAvaliacoes.totalProcessos) * 100)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1.5">já avaliado, do total distribuído pelo Protocolo</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Caixas por etapa do ciclo</h3>
                  <p className="text-xs text-gray-400 mb-3">Todas as caixas do sistema, incluindo o acervo histórico já migrado.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(resumoAvaliacoes?.porStatus ?? []).map(s => (
                      <div key={s.status} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-3 text-center">
                        <p className="text-xl font-bold text-gray-900">{s.count.toLocaleString('pt-BR')}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{CAIXA_STATUS_LABEL[s.status]}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="font-semibold text-gray-900 text-sm mb-0.5">Desempenho por avaliador</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    % de processos já avaliados frente ao que está sob responsabilidade de cada um — do que mais precisa de atenção para o mais adiantado.
                  </p>

                  {carregandoDesempenho ? (
                    <p className="text-center py-8 text-gray-400 text-sm">Carregando…</p>
                  ) : (desempenhoAvaliadores ?? []).length === 0 ? (
                    <p className="text-center py-8 text-gray-400 text-sm">Nenhum avaliador habilitado ainda.</p>
                  ) : (
                    <>
                      {(() => {
                        // O gráfico só faz sentido para quem tem caixa sob
                        // responsabilidade agora (percentual != null) — sem
                        // isso não há "progresso" nenhum para desenhar uma
                        // barra. Quem está sem caixa aparece só na tabela.
                        const comProgresso = (desempenhoAvaliadores ?? []).filter(d => d.percentual !== null)
                        return comProgresso.length > 0 ? (
                          <HorizontalProgressChart
                            ariaLabel={`Percentual avaliado por avaliador: ${comProgresso.map(d => `${d.nome} ${d.percentual}%`).join(', ')}`}
                            data={comProgresso.map(d => ({ label: d.nome, value: d.percentual as number, color: corDesempenho(d.percentual as number) }))}
                          />
                        ) : (
                          <p className="text-sm text-gray-400">Nenhum avaliador com caixa sob responsabilidade no momento.</p>
                        )
                      })()}

                      <div className="mt-5 pt-4 border-t border-gray-100 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="font-medium pb-2 pr-3">Avaliador</th>
                              <th className="font-medium pb-2 pr-3">Caixas sob responsabilidade</th>
                              <th className="font-medium pb-2 pr-3">Processos atribuídos</th>
                              <th className="font-medium pb-2 pr-3">Processos avaliados</th>
                              <th className="font-medium pb-2">% concluído</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(desempenhoAvaliadores ?? []).map(d => (
                              <tr key={d.id} className="border-t border-gray-100">
                                <td className="py-2 pr-3 font-medium text-gray-800">{d.nome}</td>
                                <td className="py-2 pr-3 text-gray-600">{d.caixas}</td>
                                <td className="py-2 pr-3 text-gray-600">{d.processosAtribuidos}</td>
                                <td className="py-2 pr-3 text-gray-600">{d.processosAvaliados}</td>
                                {d.percentual === null ? (
                                  <td className="py-2 text-gray-400" title="Sem caixa sob responsabilidade no momento">—</td>
                                ) : (
                                  <td className="py-2 font-semibold" style={{ color: corDesempenho(d.percentual) }}>{d.percentual}%</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 flex items-start gap-2.5">
                  <Construction size={16} className="text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500">
                    Em construção — o gráfico de rosca do percentual geral e o filtro de período chegam nas próximas etapas.
                  </p>
                </div>
              </>
            )}
          </div>
        )
      )}
    </div>
  )
}
