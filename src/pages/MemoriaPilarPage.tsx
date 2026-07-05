import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Star, Building2, UserCog, Layout, Calendar, CalendarPlus, Search } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Cell, LabelList, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { Pilar, Fase, Demanda, BenchmarkingRegistro, ConsultoriaMemorial, ProjetoMemorial, ReuniaoAta, Processo } from '@/lib/database.types'
import { PILAR_NOMES, pilarColor } from '@/lib/pilarColors'
import { HorizontalProgressChart } from '@/components/charts/HorizontalProgressChart'

const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }
const CONSULTORIA_LABEL: Record<string, string> = { a_contratar: 'A contratar', contratado: 'Contratado', concluido: 'Concluído' }

export function MemoriaPilarPage() {
  const { isCoord, profile } = useAuth()
  const qc = useQueryClient()
  const color = pilarColor(PILAR_NOMES.MEMORIA)

  const [showNovoBenchmarking, setShowNovoBenchmarking] = useState(false)
  const [novoBenchmarking, setNovoBenchmarking] = useState({ instituicao: '', data_visita: format(new Date(), 'yyyy-MM-dd'), notas: '' })
  const [editandoConsultoria, setEditandoConsultoria] = useState(false)
  const [consultoriaForm, setConsultoriaForm] = useState({ especialista: '', status: 'a_contratar' as ConsultoriaMemorial['status'] })
  const [editandoProjeto, setEditandoProjeto] = useState(false)
  const [projetoForm, setProjetoForm] = useState({ conceito_layout: '', orcamento_estimado: '' })
  const [showNovaAta, setShowNovaAta] = useState(false)
  const [novaAta, setNovaAta] = useState({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })

  const { data: pilar } = useQuery({
    queryKey: ['pilar-memoria'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('*, responsavel:responsavel_id(id,nome), fases(*)')
        .eq('nome', PILAR_NOMES.MEMORIA)
        .single()
      return data as (Pilar & { fases: Fase[] }) | null
    },
  })

  const { data: demandas } = useQuery({
    queryKey: ['demandas-memoria', pilar?.id],
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

  const { data: benchmarking } = useQuery({
    queryKey: ['benchmarking-registros'],
    queryFn: async () => {
      const { data } = await supabase.from('benchmarking_registros').select('*').order('data_visita', { ascending: false })
      return (data ?? []) as BenchmarkingRegistro[]
    },
  })

  const { data: consultoria } = useQuery({
    queryKey: ['consultoria-memorial'],
    queryFn: async () => {
      const { data } = await supabase.from('consultoria_memorial').select('*').limit(1).maybeSingle()
      return data as ConsultoriaMemorial | null
    },
  })

  const { data: projeto } = useQuery({
    queryKey: ['projeto-memorial'],
    queryFn: async () => {
      const { data } = await supabase.from('projeto_memorial').select('*').limit(1).maybeSingle()
      return data as ProjetoMemorial | null
    },
  })

  const { data: candidatos } = useQuery({
    queryKey: ['processos-potencial-expositivo'],
    queryFn: async () => {
      const { data } = await supabase
        .from('processos')
        .select('*, caixa:caixa_id(numero,setor), ttd:ttd_codigo_id(codigo,assunto,classe)')
        .eq('potencial_expositivo', true)
        .order('created_at', { ascending: false })
      return (data ?? []) as Processo[]
    },
  })

  const { data: atas } = useQuery({
    queryKey: ['atas-quinzenais-memoria', pilar?.id],
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

  const salvarBenchmarking = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('benchmarking_registros').insert({
        instituicao: novoBenchmarking.instituicao,
        data_visita: novoBenchmarking.data_visita || null,
        notas: novoBenchmarking.notas,
        registrado_por: profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['benchmarking-registros'] })
      setShowNovoBenchmarking(false)
      setNovoBenchmarking({ instituicao: '', data_visita: format(new Date(), 'yyyy-MM-dd'), notas: '' })
    },
  })

  const salvarConsultoria = useMutation({
    mutationFn: async () => {
      if (consultoria) {
        await supabase.from('consultoria_memorial').update({
          especialista: consultoriaForm.especialista,
          status: consultoriaForm.status,
          data_contratacao: consultoriaForm.status === 'contratado' ? format(new Date(), 'yyyy-MM-dd') : consultoria.data_contratacao,
        }).eq('id', consultoria.id)
      } else {
        await supabase.from('consultoria_memorial').insert({
          especialista: consultoriaForm.especialista,
          status: consultoriaForm.status,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultoria-memorial'] })
      setEditandoConsultoria(false)
    },
  })

  const salvarProjeto = useMutation({
    mutationFn: async () => {
      const payload = {
        conceito_layout: projetoForm.conceito_layout,
        orcamento_estimado: projetoForm.orcamento_estimado ? +projetoForm.orcamento_estimado : null,
        atualizado_por: profile!.id,
      }
      if (projeto) {
        await supabase.from('projeto_memorial').update(payload).eq('id', projeto.id)
      } else {
        await supabase.from('projeto_memorial').insert(payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projeto-memorial'] })
      setEditandoProjeto(false)
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
      qc.invalidateQueries({ queryKey: ['atas-quinzenais-memoria'] })
      setShowNovaAta(false)
      setNovaAta({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })
    },
  })

  const podeVer = isCoord || (!!pilar && profile?.pilar_id === pilar.id)

  if (!pilar) return <p className="text-gray-400 text-center py-10">Carregando…</p>
  if (!podeVer) return <p className="text-gray-500">Acesso restrito ao Coordenador e à equipe deste pilar.</p>

  const fasesOrdenadas = [...(pilar.fases ?? [])].sort((a, b) => a.ordem - b.ordem)

  const porClasse = (candidatos ?? []).reduce<Record<string, number>>((acc, p) => {
    const classe = (p.ttd as { classe?: string } | undefined)?.classe || 'Não classificado'
    acc[classe] = (acc[classe] ?? 0) + 1
    return acc
  }, {})
  const classeData = Object.entries(porClasse).map(([label, value]) => ({ label, value }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="btn-secondary px-2 py-2"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pilar.nome}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Responsável: {pilar.responsavel?.nome ?? '—'} · Prazo total: {pilar.prazo_meses} meses
          </p>
        </div>
      </div>

      {/* Progresso das 5 fases */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Progresso das Fases</h2>
        <HorizontalProgressChart
          ariaLabel="Percentual de conclusão de cada uma das 5 fases do Espaço Memória da CDTIV"
          data={fasesOrdenadas.map(f => ({ label: f.nome, value: f.percentual_conclusao, color }))}
        />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Benchmarking */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={16} /> Benchmarking</h2>
            <button className="btn-primary text-xs py-1.5" onClick={() => setShowNovoBenchmarking(v => !v)}>Novo registro</button>
          </div>
          {showNovoBenchmarking && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
              <input className="input" placeholder="Instituição" value={novoBenchmarking.instituicao} onChange={e => setNovoBenchmarking(v => ({ ...v, instituicao: e.target.value }))} />
              <input type="date" className="input" value={novoBenchmarking.data_visita} onChange={e => setNovoBenchmarking(v => ({ ...v, data_visita: e.target.value }))} />
              <textarea className="input min-h-[60px] resize-y" placeholder="Notas" value={novoBenchmarking.notas} onChange={e => setNovoBenchmarking(v => ({ ...v, notas: e.target.value }))} />
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={!novoBenchmarking.instituicao || salvarBenchmarking.isPending} onClick={() => salvarBenchmarking.mutate()}>Salvar</button>
                <button className="btn-secondary text-sm" onClick={() => setShowNovoBenchmarking(false)}>Cancelar</button>
              </div>
            </div>
          )}
          {(benchmarking ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum registro de benchmarking.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {(benchmarking ?? []).map(b => (
                <div key={b.id} className="py-2 border-b last:border-0">
                  <p className="text-sm font-medium text-gray-900">{b.instituicao}</p>
                  <p className="text-xs text-gray-400">{b.data_visita && format(new Date(b.data_visita), 'dd/MM/yyyy')} {b.notas && `· ${b.notas}`}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consultoria */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><UserCog size={16} /> Consultoria Especializada</h2>
            <button
              className="btn-secondary text-xs py-1.5"
              onClick={() => {
                setConsultoriaForm({ especialista: consultoria?.especialista ?? '', status: consultoria?.status ?? 'a_contratar' })
                setEditandoConsultoria(v => !v)
              }}
            >
              {consultoria ? 'Editar' : 'Registrar consultor'}
            </button>
          </div>
          {editandoConsultoria ? (
            <div className="space-y-2">
              <input className="input" placeholder="Especialista" value={consultoriaForm.especialista} onChange={e => setConsultoriaForm(v => ({ ...v, especialista: e.target.value }))} />
              <select className="input" value={consultoriaForm.status} onChange={e => setConsultoriaForm(v => ({ ...v, status: e.target.value as ConsultoriaMemorial['status'] }))}>
                {Object.entries(CONSULTORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={salvarConsultoria.isPending} onClick={() => salvarConsultoria.mutate()}>Salvar</button>
                <button className="btn-secondary text-sm" onClick={() => setEditandoConsultoria(false)}>Cancelar</button>
              </div>
            </div>
          ) : consultoria ? (
            <div className="text-sm">
              <p className="font-medium text-gray-900">{consultoria.especialista || 'Sem especialista definido'}</p>
              <p className="text-xs text-gray-400">{consultoria.area}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                {CONSULTORIA_LABEL[consultoria.status]}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Consultoria ainda não registrada.</p>
          )}
        </div>
      </div>

      {/* Itens candidatos */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Star size={16} className="text-accent-500" /> Itens Candidatos ao Espaço Memória</h2>
          <Link to="/acervo#buscar-memoria" className="btn-secondary text-xs py-1.5"><Search size={14} /> Buscar mais itens no acervo</Link>
        </div>
        {(candidatos ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum item marcado como candidato ainda.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
            {(candidatos ?? []).map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <span className="font-mono text-xs font-semibold text-teal-600">{(p.ttd as { codigo?: string } | undefined)?.codigo ?? '—'}</span>
                  {' '}
                  <span className="text-gray-800">{p.assunto_processo || (p.ttd as { assunto?: string } | undefined)?.assunto}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">Caixa {(p.caixa as { numero?: string } | undefined)?.numero}</span>
              </div>
            ))}
          </div>
        )}
        {classeData.length > 0 && (
          <div role="img" aria-label={`Itens candidatos agrupados por classe da TTD: ${classeData.map(c => `${c.label} (${c.value})`).join(', ')}`}>
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classeData} margin={{ top: 16, right: 8, bottom: 4, left: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32} isAnimationActive={false}>
                    {classeData.map((_, i) => <Cell key={i} fill={color} />)}
                    <LabelList dataKey="value" position="top" style={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Projeto Memorial */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Layout size={16} /> Projeto do Memorial</h2>
          <button
            className="btn-secondary text-xs py-1.5"
            onClick={() => {
              setProjetoForm({ conceito_layout: projeto?.conceito_layout ?? '', orcamento_estimado: projeto?.orcamento_estimado?.toString() ?? '' })
              setEditandoProjeto(v => !v)
            }}
          >
            {projeto ? 'Editar' : 'Registrar'}
          </button>
        </div>
        {editandoProjeto ? (
          <div className="space-y-2">
            <textarea className="input min-h-[80px] resize-y" placeholder="Conceito / layout" value={projetoForm.conceito_layout} onChange={e => setProjetoForm(v => ({ ...v, conceito_layout: e.target.value }))} />
            <input type="number" className="input" placeholder="Orçamento estimado (R$)" value={projetoForm.orcamento_estimado} onChange={e => setProjetoForm(v => ({ ...v, orcamento_estimado: e.target.value }))} />
            <div className="flex gap-2">
              <button className="btn-primary text-sm" disabled={salvarProjeto.isPending} onClick={() => salvarProjeto.mutate()}>Salvar</button>
              <button className="btn-secondary text-sm" onClick={() => setEditandoProjeto(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="sm:col-span-2">
              <p className="text-gray-400 text-xs mb-0.5">Conceito / layout</p>
              <p className="text-gray-800 whitespace-pre-wrap">{projeto?.conceito_layout || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Itens no acervo expositivo</p>
              <p className="font-semibold text-gray-900">{(candidatos ?? []).length}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-0.5">Orçamento estimado</p>
              <p className="font-semibold text-gray-900">
                {projeto?.orcamento_estimado != null ? projeto.orcamento_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
              </p>
            </div>
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
    </div>
  )
}
