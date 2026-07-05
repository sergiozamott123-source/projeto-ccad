import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckSquare, Square, FileText, History, CalendarPlus, Flag, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'
import type { Pilar, Fase, Demanda, DepartamentoMapeado, ProtocoloBoasPraticas, ReuniaoAta, Usuario } from '@/lib/database.types'
import { PILAR_NOMES, pilarColor } from '@/lib/pilarColors'
import { HorizontalProgressChart } from '@/components/charts/HorizontalProgressChart'
import { DonutChart } from '@/components/charts/DonutChart'

const STATUS_LABEL: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída' }
const STATUS_COLOR: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluida: 'bg-green-100 text-green-700',
}

export function BoasPraticasPilarPage() {
  const { isCoord, profile } = useAuth()
  const qc = useQueryClient()
  const color = pilarColor(PILAR_NOMES.BOAS_PRATICAS)

  const [showHistorico, setShowHistorico] = useState(false)
  const [editando, setEditando] = useState(false)
  const [conteudoEdicao, setConteudoEdicao] = useState('')
  const [showNovaAta, setShowNovaAta] = useState(false)
  const [novaAta, setNovaAta] = useState({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })

  const { data: pilar } = useQuery({
    queryKey: ['pilar-boas-praticas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pilares')
        .select('*, responsavel:responsavel_id(id,nome), fases(*)')
        .eq('nome', PILAR_NOMES.BOAS_PRATICAS)
        .single()
      return data as (Pilar & { fases: Fase[] }) | null
    },
  })

  const { data: demandas } = useQuery({
    queryKey: ['demandas-boas-praticas', pilar?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('demandas')
        .select('*, responsavel_pilar:responsavel_pilar_id(id,nome)')
        .eq('pilar_id', pilar!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Demanda[]
    },
    enabled: !!pilar?.id,
  })

  const { data: departamentos } = useQuery({
    queryKey: ['departamentos-mapeados'],
    queryFn: async () => {
      const { data } = await supabase
        .from('departamentos_mapeados')
        .select('*, mapeado_por_usuario:mapeado_por(id,nome)')
        .order('nome')
      return (data ?? []) as (DepartamentoMapeado & { mapeado_por_usuario: Usuario | null })[]
    },
  })

  const { data: protocoloVersoes } = useQuery({
    queryKey: ['protocolo-boas-praticas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('protocolo_boas_praticas')
        .select('*, atualizado_por_usuario:atualizado_por(id,nome)')
        .order('versao', { ascending: false })
      return (data ?? []) as (ProtocoloBoasPraticas & { atualizado_por_usuario: Usuario | null })[]
    },
  })

  const { data: atas } = useQuery({
    queryKey: ['atas-quinzenais-boas-praticas', pilar?.id],
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

  const toggleDepartamento = useMutation({
    mutationFn: async (dep: DepartamentoMapeado) => {
      const mapeado = !dep.mapeado
      await supabase.from('departamentos_mapeados').update({
        mapeado,
        mapeado_por: mapeado ? profile!.id : null,
        data_mapeamento: mapeado ? format(new Date(), 'yyyy-MM-dd') : null,
      }).eq('id', dep.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departamentos-mapeados'] }),
  })

  const salvarProtocolo = useMutation({
    mutationFn: async () => {
      const proximaVersao = (protocoloVersoes?.[0]?.versao ?? 0) + 1
      const { error } = await supabase.from('protocolo_boas_praticas').insert({
        versao: proximaVersao,
        conteudo: conteudoEdicao,
        atualizado_por: profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['protocolo-boas-praticas'] })
      setEditando(false)
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
      qc.invalidateQueries({ queryKey: ['atas-quinzenais-boas-praticas'] })
      setShowNovaAta(false)
      setNovaAta({ data_reuniao: format(new Date(), 'yyyy-MM-dd'), resumo: '' })
    },
  })

  const podeVer = isCoord || (!!pilar && profile?.pilar_id === pilar.id)

  if (!pilar) return <p className="text-gray-400 text-center py-10">Carregando…</p>
  if (!podeVer) return <p className="text-gray-500">Acesso restrito ao Coordenador e à equipe deste pilar.</p>

  const fasesOrdenadas = [...(pilar.fases ?? [])].sort((a, b) => a.ordem - b.ordem)
  const mapeados = (departamentos ?? []).filter(d => d.mapeado).length
  const restantes = (departamentos ?? []).length - mapeados
  const protocoloAtual = protocoloVersoes?.[0] ?? null

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
          ariaLabel="Percentual de conclusão de cada uma das 5 fases do Protocolo de Boas Práticas"
          data={fasesOrdenadas.map(f => ({ label: f.nome, value: f.percentual_conclusao, color }))}
        />
      </div>

      {/* Departamentos mapeados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Departamentos Mapeados</h2>
          <DonutChart
            ariaLabel={`Departamentos mapeados: ${mapeados} de ${(departamentos ?? []).length}, ${restantes} restantes`}
            centerLabel="departamentos"
            data={[
              { label: 'Mapeados', value: mapeados, color },
              { label: 'Restantes', value: restantes, color: '#e5e7eb' },
            ]}
          />
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Checklist de Mapeamento</h2>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(departamentos ?? []).map(dep => (
              <button
                key={dep.id}
                onClick={() => toggleDepartamento.mutate(dep)}
                className="w-full flex items-center gap-2.5 py-2 px-1 rounded-lg hover:bg-gray-50 text-left"
              >
                {dep.mapeado
                  ? <CheckSquare size={18} className="text-teal-600 shrink-0" />
                  : <Square size={18} className="text-gray-300 shrink-0" />}
                <span className="text-sm text-gray-800 flex-1">{dep.nome}</span>
                {dep.mapeado && dep.mapeado_por_usuario && (
                  <span className="text-xs text-gray-400">
                    {dep.mapeado_por_usuario.nome} · {dep.data_mapeamento && format(new Date(dep.data_mapeamento), 'dd/MM/yy')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Demandas do pilar */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Demandas do Pilar</h2>
        {(demandas ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma demanda registrada.</p>
        ) : (
          <div className="space-y-2">
            {(demandas ?? []).map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.titulo}</p>
                  {d.prazo && <p className="text-xs text-gray-400">Prazo: {format(new Date(d.prazo), 'dd/MM/yyyy', { locale: ptBR })}</p>}
                </div>
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[d.status])}>
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Protocolo de Boas Práticas */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileText size={16} /> Protocolo de Boas Práticas</h2>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs py-1.5" onClick={() => setShowHistorico(v => !v)}>
              <History size={14} /> Histórico
            </button>
            {!editando && (
              <button
                className="btn-primary text-xs py-1.5"
                onClick={() => { setEditando(true); setConteudoEdicao(protocoloAtual?.conteudo ?? '') }}
              >
                Editar
              </button>
            )}
          </div>
        </div>

        {editando ? (
          <div className="space-y-2">
            <textarea
              className="input min-h-[160px] resize-y"
              value={conteudoEdicao}
              onChange={e => setConteudoEdicao(e.target.value)}
              placeholder="Conteúdo do protocolo…"
            />
            <div className="flex gap-2">
              <button className="btn-primary text-sm" disabled={!conteudoEdicao.trim() || salvarProtocolo.isPending} onClick={() => salvarProtocolo.mutate()}>
                Salvar como versão {(protocoloVersoes?.[0]?.versao ?? 0) + 1}
              </button>
              <button className="btn-secondary text-sm" onClick={() => setEditando(false)}>Cancelar</button>
            </div>
          </div>
        ) : protocoloAtual ? (
          <div>
            <p className="text-xs text-gray-400 mb-1">
              Versão {protocoloAtual.versao} · atualizado por {protocoloAtual.atualizado_por_usuario?.nome ?? '—'} em {format(new Date(protocoloAtual.atualizado_em), 'dd/MM/yyyy')}
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{protocoloAtual.conteudo}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nenhuma versão registrada ainda.</p>
        )}

        {showHistorico && (protocoloVersoes?.length ?? 0) > 1 && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {protocoloVersoes!.slice(1).map(v => (
              <div key={v.id} className="text-sm">
                <p className="text-xs text-gray-400">
                  Versão {v.versao} · {v.atualizado_por_usuario?.nome ?? '—'} em {format(new Date(v.atualizado_em), 'dd/MM/yyyy')}
                </p>
                <p className="text-gray-600 whitespace-pre-wrap line-clamp-3">{v.conteudo}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reuniões quinzenais da frente */}
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

      <Link to="/equipe" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
        <Flag size={14} /> Ver responsáveis por pilar
      </Link>
    </div>
  )
}
