import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Gavel, ScanLine, Info, Calendar, CalendarPlus, Flag, CheckCircle, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format, addMonths } from 'date-fns'
import type { Pilar, Fase, Demanda, IndicadorMensal, LicitacaoDigitalizacao, DigitalizacaoMetaAnual, ReuniaoAta, StatusLicitacaoDigitalizacao, AtividadeFase } from '@/lib/database.types'
import { PILAR_NOMES, pilarColor } from '@/lib/pilarColors'
import { HorizontalProgressChart } from '@/components/charts/HorizontalProgressChart'
import { DonutChart } from '@/components/charts/DonutChart'

const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }
const STATUS_LICITACAO_LABEL: Record<StatusLicitacaoDigitalizacao, string> = {
  a_iniciar: 'A iniciar',
  tr_em_validacao: 'TR em validação',
  licitacao_aberta: 'Licitação aberta',
  contratado: 'Contratado',
  em_execucao: 'Em execução',
}
const STATUS_LICITACAO_COLOR: Record<StatusLicitacaoDigitalizacao, string> = {
  a_iniciar: 'bg-gray-100 text-gray-700',
  tr_em_validacao: 'bg-yellow-100 text-yellow-700',
  licitacao_aberta: 'bg-blue-100 text-blue-700',
  contratado: 'bg-teal-100 text-teal-700',
  em_execucao: 'bg-green-100 text-green-700',
}

const ANOS = [1, 2, 3, 4, 5]

const INDICADORES: {
  metaField: keyof DigitalizacaoMetaAnual
  label: string
  realizadoField: keyof IndicadorMensal
}[] = [
  { metaField: 'caixas_meta', label: 'Caixas organizadas', realizadoField: 'caixas_organizadas' },
  { metaField: 'paginas_meta', label: 'Páginas digitalizadas', realizadoField: 'paginas_digitalizadas' },
  { metaField: 'documentos_meta', label: 'Documentos indexados', realizadoField: 'documentos_indexados' },
  { metaField: 'certificacoes_meta', label: 'Certificações digitais', realizadoField: 'certificacoes_digitais' },
]

function fmtNumero(v: number | null | undefined) {
  return (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function fmtMoeda(v: number | null | undefined) {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function DigitalizacaoPilarPage() {
  const { isCoord, profile } = useAuth()
  const qc = useQueryClient()
  const color = pilarColor(PILAR_NOMES.DIGITALIZACAO)

  const [editandoLicitacao, setEditandoLicitacao] = useState(false)
  const [licitacaoForm, setLicitacaoForm] = useState({
    status: 'a_iniciar' as StatusLicitacaoDigitalizacao,
    tr_validado: false,
    dotacao_confirmada: false,
    empresa_contratada: '',
    data_assinatura: '',
  })
  const [editingField, setEditingField] = useState<keyof DigitalizacaoMetaAnual | null>(null)
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [showNovaAta, setShowNovaAta] = useState(false)
  const [novaAta, setNovaAta] = useState({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })
  const [novaAtividade, setNovaAtividade] = useState<Record<string, string>>({})

  const { data: pilar } = useQuery({
    queryKey: ['pilar-digitalizacao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('*, responsavel:responsavel_id(id,nome), fases(*)')
        .eq('nome', PILAR_NOMES.DIGITALIZACAO)
        .single()
      return data as (Pilar & { fases: Fase[] }) | null
    },
  })

  const { data: demandas } = useQuery({
    queryKey: ['demandas-digitalizacao', pilar?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('demandas')
        .select('*')
        .eq('pilar_id', pilar!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Demanda[]
    },
    enabled: !!pilar?.id,
  })

  const { data: licitacao } = useQuery({
    queryKey: ['licitacao-digitalizacao'],
    queryFn: async () => {
      const { data } = await supabase.from('licitacao_digitalizacao').select('*').limit(1).maybeSingle()
      return data as LicitacaoDigitalizacao | null
    },
  })

  const { data: metas } = useQuery({
    queryKey: ['digitalizacao-metas'],
    queryFn: async () => {
      const { data } = await supabase.from('digitalizacao_metas_anuais').select('*').order('ano_execucao')
      return (data ?? []) as DigitalizacaoMetaAnual[]
    },
  })

  const { data: indicadores } = useQuery({
    queryKey: ['indicadores-digitalizacao', pilar?.id],
    queryFn: async () => {
      const { data } = await supabase.from('indicadores_mensais').select('*').eq('pilar_id', pilar!.id)
      return (data ?? []) as IndicadorMensal[]
    },
    enabled: !!pilar?.id,
  })

  const { data: atas } = useQuery({
    queryKey: ['atas-quinzenais-digitalizacao', pilar?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('reunioes_atas')
        .select('*')
        .eq('tipo', 'quinzenal_frente')
        .eq('pilar_id', pilar!.id)
        .order('data_reuniao', { ascending: false })
      return (data ?? []) as ReuniaoAta[]
    },
    enabled: !!pilar?.id,
  })

  const { data: atividades } = useQuery({
    queryKey: ['atividades-fase-digitalizacao', pilar?.id],
    queryFn: async () => {
      const faseIds = (pilar?.fases ?? []).map(f => f.id)
      if (faseIds.length === 0) return []
      const { data } = await supabase
        .from('atividades_fase')
        .select('*, concluida_por_usuario:concluida_por(id,nome)')
        .in('fase_id', faseIds)
        .order('created_at')
      return (data ?? []) as AtividadeFase[]
    },
    enabled: !!pilar?.id,
  })

  const concluirAtividade = useMutation({
    mutationFn: async (a: AtividadeFase) => {
      const { error } = await supabase
        .from('atividades_fase')
        .update({ concluida: true, concluida_por: profile!.id, concluida_em: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atividades-fase-digitalizacao', pilar?.id] })
      qc.invalidateQueries({ queryKey: ['pilar-digitalizacao'] })
    },
  })

  const criarAtividade = useMutation({
    mutationFn: async (faseId: string) => {
      const titulo = (novaAtividade[faseId] ?? '').trim()
      if (!titulo) return
      const { error } = await supabase.from('atividades_fase').insert({ fase_id: faseId, titulo, criado_por: profile!.id })
      if (error) throw error
    },
    onSuccess: (_data, faseId) => {
      qc.invalidateQueries({ queryKey: ['atividades-fase-digitalizacao', pilar?.id] })
      setNovaAtividade(v => ({ ...v, [faseId]: '' }))
    },
  })

  const salvarLicitacao = useMutation({
    mutationFn: async () => {
      const payload = {
        status: licitacaoForm.status,
        tr_validado: licitacaoForm.tr_validado,
        dotacao_confirmada: licitacaoForm.dotacao_confirmada,
        empresa_contratada: licitacaoForm.empresa_contratada || null,
        data_assinatura: licitacaoForm.data_assinatura || null,
        atualizado_por: profile!.id,
      }
      if (licitacao) {
        await supabase.from('licitacao_digitalizacao').update(payload).eq('id', licitacao.id)
      } else {
        await supabase.from('licitacao_digitalizacao').insert(payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['licitacao-digitalizacao'] })
      setEditandoLicitacao(false)
    },
  })

  const salvarLinhaMeta = useMutation({
    mutationFn: async () => {
      if (!editingField) return
      const field = editingField
      await Promise.all(ANOS.map(ano => {
        const raw = editValues[ano] ?? ''
        const valor = raw === '' ? (field === 'investimento_realizado' ? null : 0) : +raw
        return supabase
          .from('digitalizacao_metas_anuais')
          .update({ [field]: valor, atualizado_por: profile!.id } as Partial<DigitalizacaoMetaAnual>)
          .eq('ano_execucao', ano)
      }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['digitalizacao-metas'] })
      setEditingField(null)
    },
  })

  const registrarAta = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('reunioes_atas').insert({
        tipo: 'quinzenal_frente',
        pilar_id: pilar!.id,
        data_reuniao: novaAta.data_reuniao,
        resumo: novaAta.resumo,
        criado_por: profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atas-quinzenais-digitalizacao'] })
      setShowNovaAta(false)
      setNovaAta({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })
    },
  })

  const podeVer = isCoord || (!!pilar && profile?.pilar_id === pilar.id)

  if (!pilar) return <p className="text-gray-400 text-center py-10">Carregando…</p>
  if (!podeVer) return <p className="text-gray-500">Acesso restrito ao Coordenador e à equipe deste pilar.</p>

  const fasesOrdenadas = [...(pilar.fases ?? [])].sort((a, b) => a.ordem - b.ordem)
  const anosPrazo = Math.round(pilar.prazo_meses / 12)

  const metasPorAno = Object.fromEntries((metas ?? []).map(m => [m.ano_execucao, m])) as Record<number, DigitalizacaoMetaAnual | undefined>

  const totalPaginasDigitalizadas = (indicadores ?? []).reduce((s, i) => s + (i.paginas_digitalizadas ?? 0), 0)
  const metaAcumuladaPaginas = (metas ?? []).reduce((s, m) => s + (m.paginas_meta ?? 0), 0)
  const restantePaginas = Math.max(metaAcumuladaPaginas - totalPaginasDigitalizadas, 0)

  const dataInicio = licitacao?.data_inicio_execucao ? new Date(licitacao.data_inicio_execucao) : null

  function realizadoNoAno(ano: number, field: keyof IndicadorMensal): number {
    if (!dataInicio) return 0
    const inicioJanela = addMonths(dataInicio, (ano - 1) * 12)
    const fimJanela = addMonths(dataInicio, ano * 12)
    return (indicadores ?? [])
      .filter(i => {
        const mes = new Date(i.mes_referencia)
        return mes >= inicioJanela && mes < fimJanela
      })
      .reduce((s, i) => s + ((i[field] as number) ?? 0), 0)
  }

  function iniciarEdicao(field: keyof DigitalizacaoMetaAnual) {
    const valores: Record<number, string> = {}
    for (const ano of ANOS) {
      const v = metasPorAno[ano]?.[field]
      valores[ano] = v == null ? '' : String(v)
    }
    setEditValues(valores)
    setEditingField(field)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="btn-secondary px-2 py-2"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pilar.nome}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Responsável: {pilar.responsavel?.nome ?? '—'} · Prazo total: {pilar.prazo_meses} meses ({anosPrazo} {anosPrazo === 1 ? 'ano' : 'anos'})
          </p>
        </div>
      </div>

      {/* Progresso das fases */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Progresso das Fases</h2>
        <HorizontalProgressChart
          ariaLabel="Percentual de conclusão de cada uma das fases da Digitalização do Acervo"
          data={fasesOrdenadas.map(f => ({ label: f.nome, value: f.percentual_conclusao, color }))}
        />
      </div>

      {/* Atividades por Fase */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Atividades por Fase</h2>
        <div className="space-y-5">
          {fasesOrdenadas.map(fase => {
            const atividadesFase = (atividades ?? []).filter(a => a.fase_id === fase.id)
            return (
              <div key={fase.id} className="border-b last:border-0 pb-5 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">{fase.nome}</h3>
                  <span className="text-sm font-bold text-gray-900">{fase.percentual_conclusao}%</span>
                </div>
                {atividadesFase.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-2">Nenhuma atividade cadastrada nesta fase.</p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {atividadesFase.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={a.concluida || concluirAtividade.isPending}
                        onClick={() => concluirAtividade.mutate(a)}
                        className="flex items-start gap-2 w-full text-left disabled:cursor-default"
                      >
                        {a.concluida ? (
                          <CheckCircle size={16} className="text-teal-600 mt-0.5 shrink-0" />
                        ) : (
                          <Circle size={16} className="text-gray-300 mt-0.5 shrink-0" />
                        )}
                        <span>
                          <span className={a.concluida ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-800'}>{a.titulo}</span>
                          {a.concluida && (
                            <span className="block text-xs text-gray-400">
                              {a.concluida_por_usuario?.nome ?? '—'} · {a.concluida_em ? format(new Date(a.concluida_em), 'dd/MM/yy') : ''}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="input text-sm flex-1"
                    placeholder="Nova atividade..."
                    value={novaAtividade[fase.id] ?? ''}
                    onChange={e => setNovaAtividade(v => ({ ...v, [fase.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') criarAtividade.mutate(fase.id) }}
                  />
                  <button
                    className="btn-secondary text-xs shrink-0"
                    disabled={criarAtividade.isPending || !(novaAtividade[fase.id] ?? '').trim()}
                    onClick={() => criarAtividade.mutate(fase.id)}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Licitação */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Gavel size={16} /> Licitação</h2>
            <button
              className="btn-secondary text-xs py-1.5"
              onClick={() => {
                setLicitacaoForm({
                  status: licitacao?.status ?? 'a_iniciar',
                  tr_validado: licitacao?.tr_validado ?? false,
                  dotacao_confirmada: licitacao?.dotacao_confirmada ?? false,
                  empresa_contratada: licitacao?.empresa_contratada ?? '',
                  data_assinatura: licitacao?.data_assinatura ?? '',
                })
                setEditandoLicitacao(v => !v)
              }}
            >
              Editar
            </button>
          </div>

          {editandoLicitacao ? (
            <div className="space-y-2">
              <select
                className="input"
                value={licitacaoForm.status}
                onChange={e => setLicitacaoForm(v => ({ ...v, status: e.target.value as StatusLicitacaoDigitalizacao }))}
              >
                {Object.entries(STATUS_LICITACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={licitacaoForm.tr_validado} onChange={e => setLicitacaoForm(v => ({ ...v, tr_validado: e.target.checked }))} />
                TR validado
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={licitacaoForm.dotacao_confirmada} onChange={e => setLicitacaoForm(v => ({ ...v, dotacao_confirmada: e.target.checked }))} />
                Dotação orçamentária confirmada
              </label>
              <input className="input" placeholder="Empresa contratada" value={licitacaoForm.empresa_contratada} onChange={e => setLicitacaoForm(v => ({ ...v, empresa_contratada: e.target.value }))} />
              <input type="date" className="input" value={licitacaoForm.data_assinatura} onChange={e => setLicitacaoForm(v => ({ ...v, data_assinatura: e.target.value }))} />
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={salvarLicitacao.isPending} onClick={() => salvarLicitacao.mutate()}>Salvar</button>
                <button className="btn-secondary text-sm" onClick={() => setEditandoLicitacao(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LICITACAO_COLOR[licitacao?.status ?? 'a_iniciar']}`}>
                {STATUS_LICITACAO_LABEL[licitacao?.status ?? 'a_iniciar']}
              </span>
              <p className="text-gray-600">TR validado: <span className="font-medium text-gray-900">{licitacao?.tr_validado ? 'Sim' : 'Não'}</span></p>
              <p className="text-gray-600">Dotação confirmada: <span className="font-medium text-gray-900">{licitacao?.dotacao_confirmada ? 'Sim' : 'Não'}</span></p>
              <p className="text-gray-600">Empresa contratada: <span className="font-medium text-gray-900">{licitacao?.empresa_contratada || '—'}</span></p>
              <p className="text-gray-600">
                Data de assinatura: <span className="font-medium text-gray-900">{licitacao?.data_assinatura ? format(new Date(licitacao.data_assinatura), 'dd/MM/yyyy') : '—'}</span>
              </p>
            </div>
          )}
        </div>

        {/* Acervo digitalizado */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><ScanLine size={16} /> Acervo Digitalizado</h2>
          <DonutChart
            ariaLabel={`Páginas digitalizadas: ${totalPaginasDigitalizadas.toLocaleString('pt-BR')} de uma meta acumulada de ${metaAcumuladaPaginas.toLocaleString('pt-BR')} páginas`}
            centerLabel="páginas"
            data={[
              { label: 'Digitalizadas', value: totalPaginasDigitalizadas, color },
              { label: 'Restante até a meta', value: restantePaginas, color: '#e5e7eb' },
            ]}
          />
          <p className="text-xs text-gray-400 mt-3">Meta acumulada (5 anos): {metaAcumuladaPaginas.toLocaleString('pt-BR')} páginas</p>
        </div>
      </div>

      {/* Marcos por ano */}
      <div className="card p-5 overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-1">Marcos por Ano de Execução</h2>
        {!dataInicio && (
          <p className="text-xs text-gray-400 mb-3">Execução ainda não iniciada — defina a data de início no card de Licitação para acompanhar o realizado.</p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs">
              <th className="py-1 pr-3 font-medium">Indicador</th>
              {ANOS.map(ano => <th key={ano} className="py-1 px-2 font-medium text-right">Ano {ano}</th>)}
              <th className="py-1 pl-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {INDICADORES.map(ind => (
              <Fragment key={ind.metaField}>
                <tr className="border-t">
                  <td className="py-2 pr-3 text-gray-700">{ind.label} — meta</td>
                  {ANOS.map(ano => (
                    <td key={ano} className="py-2 px-2 text-right">
                      {editingField === ind.metaField ? (
                        <input
                          type="number"
                          className="input py-1 text-right w-24"
                          value={editValues[ano] ?? ''}
                          onChange={e => setEditValues(v => ({ ...v, [ano]: e.target.value }))}
                        />
                      ) : (
                        <span className="font-medium text-gray-900">{fmtNumero(metasPorAno[ano]?.[ind.metaField] as number | undefined)}</span>
                      )}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right">
                    {podeVer && (editingField === ind.metaField ? (
                      <div className="flex gap-1 justify-end">
                        <button className="btn-primary text-xs py-1 px-2" disabled={salvarLinhaMeta.isPending} onClick={() => salvarLinhaMeta.mutate()}>Salvar</button>
                        <button className="btn-secondary text-xs py-1 px-2" onClick={() => setEditingField(null)}>X</button>
                      </div>
                    ) : (
                      <button className="btn-secondary text-xs py-1 px-2" onClick={() => iniciarEdicao(ind.metaField)}>Editar</button>
                    ))}
                  </td>
                </tr>
                <tr className="border-t border-dashed">
                  <td className="py-2 pr-3 text-gray-400">{ind.label} — realizado</td>
                  {dataInicio ? (
                    ANOS.map(ano => (
                      <td key={ano} className="py-2 px-2 text-right text-gray-500">{fmtNumero(realizadoNoAno(ano, ind.realizadoField))}</td>
                    ))
                  ) : (
                    <td colSpan={ANOS.length} className="py-2 px-2 text-center text-gray-300 text-xs">Execução ainda não iniciada</td>
                  )}
                  <td />
                </tr>
              </Fragment>
            ))}

            {/* Investimento */}
            <tr className="border-t">
              <td className="py-2 pr-3 text-gray-700">Investimento — meta</td>
              {ANOS.map(ano => (
                <td key={ano} className="py-2 px-2 text-right">
                  {editingField === 'investimento_meta' ? (
                    <input
                      type="number"
                      className="input py-1 text-right w-24"
                      value={editValues[ano] ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, [ano]: e.target.value }))}
                    />
                  ) : (
                    <span className="font-medium text-gray-900">{fmtMoeda(metasPorAno[ano]?.investimento_meta)}</span>
                  )}
                </td>
              ))}
              <td className="py-2 pl-2 text-right">
                {podeVer && (editingField === 'investimento_meta' ? (
                  <div className="flex gap-1 justify-end">
                    <button className="btn-primary text-xs py-1 px-2" disabled={salvarLinhaMeta.isPending} onClick={() => salvarLinhaMeta.mutate()}>Salvar</button>
                    <button className="btn-secondary text-xs py-1 px-2" onClick={() => setEditingField(null)}>X</button>
                  </div>
                ) : (
                  <button className="btn-secondary text-xs py-1 px-2" onClick={() => iniciarEdicao('investimento_meta')}>Editar</button>
                ))}
              </td>
            </tr>
            <tr className="border-t border-dashed">
              <td className="py-2 pr-3 text-gray-400">Investimento — realizado <span className="text-gray-300">(lançamento manual)</span></td>
              {ANOS.map(ano => (
                <td key={ano} className="py-2 px-2 text-right">
                  {editingField === 'investimento_realizado' ? (
                    <input
                      type="number"
                      className="input py-1 text-right w-24"
                      value={editValues[ano] ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, [ano]: e.target.value }))}
                    />
                  ) : (
                    <span className="text-gray-500">{fmtMoeda(metasPorAno[ano]?.investimento_realizado)}</span>
                  )}
                </td>
              ))}
              <td className="py-2 pl-2 text-right">
                {podeVer && (editingField === 'investimento_realizado' ? (
                  <div className="flex gap-1 justify-end">
                    <button className="btn-primary text-xs py-1 px-2" disabled={salvarLinhaMeta.isPending} onClick={() => salvarLinhaMeta.mutate()}>Salvar</button>
                    <button className="btn-secondary text-xs py-1 px-2" onClick={() => setEditingField(null)}>X</button>
                  </div>
                ) : (
                  <button className="btn-secondary text-xs py-1 px-2" onClick={() => iniciarEdicao('investimento_realizado')}>Editar</button>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Nota de padrão técnico */}
      <div className="card p-5 bg-blue-50 border border-blue-100">
        <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2"><Info size={16} /> Padrão Técnico de Digitalização</h2>
        <p className="text-sm text-gray-700">
          Conforme o <strong>Decreto Municipal nº 26.127/2026</strong>, a digitalização deve seguir: textos em <strong>300 dpi</strong>, formato PDF/A;
          fotografias, cartazes e plantas em <strong>300–600 dpi</strong>, formato PNG; e o preenchimento dos metadados mínimos definidos no <strong>Anexo II</strong> do decreto.
        </p>
      </div>

      {/* Demandas */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Demandas do Pilar</h2>
        {(demandas ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma demanda registrada.</p>
        ) : (
          <div className="space-y-2">
            {(demandas ?? []).map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                <span className="text-xs text-gray-400">{STATUS_LABEL[d.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Atas quinzenais */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Atas — Reuniões Quinzenais da Frente</h2>
          <button className="btn-primary text-xs py-1.5" onClick={() => setShowNovaAta(v => !v)}>
            <CalendarPlus size={14} /> Registrar ata
          </button>
        </div>
        {showNovaAta && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
            <div>
              <label className="label">Data da reunião</label>
              <input type="date" className="input" value={novaAta.data_reuniao} onChange={e => setNovaAta(v => ({ ...v, data_reuniao: e.target.value }))} />
            </div>
            <div>
              <label className="label">Resumo</label>
              <textarea className="input min-h-[80px] resize-y" value={novaAta.resumo} onChange={e => setNovaAta(v => ({ ...v, resumo: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-sm" disabled={registrarAta.isPending} onClick={() => registrarAta.mutate()}>Salvar ata</button>
              <button className="btn-secondary text-sm" onClick={() => setShowNovaAta(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {(atas ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma ata registrada.</p>
        ) : (
          <div className="space-y-2">
            {(atas ?? []).map(a => (
              <div key={a.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{format(new Date(a.data_reuniao), 'dd/MM/yyyy')}</p>
                  {a.resumo && <p className="text-xs text-gray-500">{a.resumo}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Link to="/acervo" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
          <ScanLine size={14} /> Abrir ferramenta de catalogação (Acervo)
        </Link>
        <Link to="/equipe" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
          <Flag size={14} /> Ver responsáveis por pilar
        </Link>
      </div>
    </div>
  )
}
