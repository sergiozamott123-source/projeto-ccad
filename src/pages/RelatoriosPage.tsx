import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Send, Save, Wand2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { RelatorioMensal, Demanda } from '@/lib/database.types'
import { format, startOfMonth, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

interface AtividadesImportadas {
  processos_avaliados_qtd: number
  processos_avaliados_numeros: string[]
  requisicoes_emitidas_qtd: number
  requisicoes_emitidas_caixas: string[]
}

const ATIVIDADES_VAZIAS: AtividadesImportadas = {
  processos_avaliados_qtd: 0,
  processos_avaliados_numeros: [],
  requisicoes_emitidas_qtd: 0,
  requisicoes_emitidas_caixas: [],
}

// Busca, direto no banco, quantos processos o membro avaliou e quantas
// requisições ele emitiu (se for do Protocolo) dentro do mês de
// referência do relatório — para preencher automaticamente essa parte,
// em vez do membro ter que lembrar e digitar esses números de cabeça.
async function buscarAtividadesDoMes(usuarioId: string, mesReferencia: string): Promise<AtividadesImportadas> {
  const inicio = mesReferencia
  const fim = format(addMonths(new Date(mesReferencia), 1), 'yyyy-MM-dd')

  const [avaliacoesRes, requisicoesRes] = await Promise.all([
    supabase
      .from('avaliacoes')
      .select('processo:processo_id(numero_documento)')
      .eq('avaliado_por', usuarioId)
      .gte('created_at', inicio)
      .lt('created_at', fim),
    supabase
      .from('requisicoes_avaliacao')
      .select('caixa:caixa_id(numero)')
      .eq('criado_por', usuarioId)
      .gte('created_at', inicio)
      .lt('created_at', fim),
  ])

  const numerosProcessos = (avaliacoesRes.data ?? [])
    .map(a => (a as unknown as { processo: { numero_documento: string | null } | null }).processo?.numero_documento)
    .filter((n): n is string => !!n)
    .sort()

  const numerosCaixas = (requisicoesRes.data ?? [])
    .map(r => (r as unknown as { caixa: { numero: string | null } | null }).caixa?.numero)
    .filter((n): n is string => !!n)
    .sort()

  return {
    processos_avaliados_qtd: numerosProcessos.length,
    processos_avaliados_numeros: numerosProcessos,
    requisicoes_emitidas_qtd: numerosCaixas.length,
    requisicoes_emitidas_caixas: numerosCaixas,
  }
}

const STATUS_COLOR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-600',
  enviado: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
}

export function RelatoriosPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const mesAtual = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const mesAnterior = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  const [selectedMes, setSelectedMes] = useState(mesAtual)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    atividades_realizadas: '',
    dificuldades: '',
    ...ATIVIDADES_VAZIAS,
  })
  const [importando, setImportando] = useState(false)
  const [importado, setImportado] = useState(false)

  const { data: relatorios } = useQuery({
    queryKey: ['meus-relatorios', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('*, pilar:pilar_id(id,nome)')
        .eq('usuario_id', profile!.id)
        .order('mes_referencia', { ascending: false })
      return (data ?? []) as RelatorioMensal[]
    },
    enabled: !!profile?.id,
  })

  const { data: demandasMes } = useQuery({
    queryKey: ['demandas-mes-concluidas', profile?.id, selectedMes],
    queryFn: async () => {
      const { data: dm } = await supabase
        .from('demanda_membros')
        .select('demanda_id')
        .eq('usuario_id', profile!.id)
      const ids = (dm ?? []).map(d => d.demanda_id)
      if (!ids.length) return []
      const { data } = await supabase
        .from('demandas')
        .select('id, titulo, status')
        .in('id', ids)
      return (data ?? []) as Pick<Demanda, 'id' | 'titulo' | 'status'>[]
    },
    enabled: !!profile?.id,
  })

  const [demandasChecked, setDemandasChecked] = useState<string[]>([])

  const relatorioDoMes = relatorios?.find(r => r.mes_referencia === selectedMes)

  // Sempre que troca o mês selecionado (ou os relatórios terminam de
  // carregar), recarrega o formulário com o que já está salvo daquele
  // mês — sem isso, clicar em "Editar relatório" abria os campos em
  // branco mesmo já havendo um rascunho salvo.
  useEffect(() => {
    setForm({
      atividades_realizadas: relatorioDoMes?.atividades_realizadas ?? '',
      dificuldades: relatorioDoMes?.dificuldades ?? '',
      processos_avaliados_qtd: relatorioDoMes?.processos_avaliados_qtd ?? 0,
      processos_avaliados_numeros: relatorioDoMes?.processos_avaliados_numeros ?? [],
      requisicoes_emitidas_qtd: relatorioDoMes?.requisicoes_emitidas_qtd ?? 0,
      requisicoes_emitidas_caixas: relatorioDoMes?.requisicoes_emitidas_caixas ?? [],
    })
    setDemandasChecked(relatorioDoMes?.demandas_relacionadas ?? [])
    setImportado(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMes, relatorioDoMes?.id])

  async function handleImportarAtividades() {
    if (!profile?.id) return
    setImportando(true)
    try {
      const atividades = await buscarAtividadesDoMes(profile.id, selectedMes)
      setForm(v => ({ ...v, ...atividades }))
      setImportado(true)
    } finally {
      setImportando(false)
    }
  }

  const saveRelatorio = useMutation({
    mutationFn: async (status: 'rascunho' | 'enviado') => {
      const existing = relatorios?.find(r => r.mes_referencia === selectedMes)
      if (existing) {
        const { error } = await supabase.from('relatorios_mensais').update({
          ...form,
          status,
          demandas_relacionadas: demandasChecked,
          ...(status === 'enviado' ? { enviado_em: new Date().toISOString() } : {}),
        } as Partial<RelatorioMensal>).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('relatorios_mensais').insert({
          usuario_id: profile!.id,
          pilar_id: profile!.pilar_id,
          mes_referencia: selectedMes,
          ...form,
          status,
          demandas_relacionadas: demandasChecked,
          evidencias_urls: [],
          ...(status === 'enviado' ? { enviado_em: new Date().toISOString() } : {}),
        } as Partial<RelatorioMensal>)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meus-relatorios'] })
      setShowForm(false)
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios Mensais</h1>
          <p className="text-gray-500 text-sm mt-0.5">Obrigatório até o dia 20 de cada mês.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          <FileText size={16} /> {relatorioDoMes ? 'Editar relatório' : 'Novo relatório'}
        </button>
      </div>

      {/* Month selector */}
      <div className="flex gap-2">
        {[mesAtual, mesAnterior].map(m => (
          <button
            key={m}
            onClick={() => setSelectedMes(m)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              selectedMes === m
                ? 'bg-teal-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {format(new Date(m), 'MMMM yyyy', { locale: ptBR })}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">
            Relatório — {format(new Date(selectedMes), 'MMMM yyyy', { locale: ptBR })}
          </h2>

          {(profile?.pode_avaliar_processos || profile?.pode_criar_requisicoes) && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-900">Importar minhas atividades do mês</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Busca automaticamente, no próprio sistema, quantos processos você avaliou
                    {profile?.pode_criar_requisicoes ? ' e quantas requisições você emitiu' : ''} em{' '}
                    {format(new Date(selectedMes), 'MMMM yyyy', { locale: ptBR })} — sem precisar contar de cabeça.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1.5 shrink-0"
                  disabled={importando}
                  onClick={handleImportarAtividades}
                >
                  <Wand2 size={14} /> {importando ? 'Buscando…' : 'Importar atividades'}
                </button>
              </div>

              {importado && (
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={13} /> Atividades importadas — confira abaixo e clique em "Salvar rascunho" ou "Enviar relatório" para gravar.
                </p>
              )}

              {profile?.pode_avaliar_processos && (
                <div className="text-sm">
                  <p className="text-gray-700">
                    <strong>{form.processos_avaliados_qtd}</strong> processo(s) avaliado(s) no mês
                  </p>
                  {form.processos_avaliados_numeros.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Nº: {form.processos_avaliados_numeros.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {profile?.pode_criar_requisicoes && (
                <div className="text-sm">
                  <p className="text-gray-700">
                    <strong>{form.requisicoes_emitidas_qtd}</strong> requisição(ões) emitida(s) no mês
                  </p>
                  {form.requisicoes_emitidas_caixas.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Caixas: {form.requisicoes_emitidas_caixas.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">Atividades realizadas *</label>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder="Descreva as atividades realizadas no mês…"
              value={form.atividades_realizadas}
              onChange={e => setForm(v => ({ ...v, atividades_realizadas: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Dificuldades encontradas</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Dificuldades, obstáculos, atrasos…"
              value={form.dificuldades}
              onChange={e => setForm(v => ({ ...v, dificuldades: e.target.value }))}
            />
          </div>
          {(demandasMes ?? []).length > 0 && (
            <div>
              <label className="label">Demandas concluídas este mês</label>
              <div className="space-y-1 mt-1">
                {(demandasMes ?? []).map(d => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-teal-500"
                      checked={demandasChecked.includes(d.id)}
                      onChange={e => {
                        if (e.target.checked) setDemandasChecked(v => [...v, d.id])
                        else setDemandasChecked(v => v.filter(i => i !== d.id))
                      }}
                    />
                    {d.titulo}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              className="btn-secondary"
              disabled={saveRelatorio.isPending}
              onClick={() => saveRelatorio.mutate('rascunho')}
            >
              <Save size={14} /> Salvar rascunho
            </button>
            <button
              className="btn-primary"
              disabled={!form.atividades_realizadas || saveRelatorio.isPending}
              onClick={() => saveRelatorio.mutate('enviado')}
            >
              <Send size={14} /> Enviar relatório
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Histórico</h2>
        </div>
        {(relatorios ?? []).length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum relatório registrado.</p>
        ) : (
          <div className="divide-y">
            {(relatorios ?? []).map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {format(new Date(r.mes_referencia), 'MMMM yyyy', { locale: ptBR })}
                  </p>
                  {r.enviado_em && (
                    <p className="text-xs text-gray-400">
                      Enviado em {format(new Date(r.enviado_em), 'dd/MM/yyyy HH:mm')}
                    </p>
                  )}
                </div>
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[r.status])}>
                  {r.status === 'rascunho' ? 'Rascunho' : r.status === 'enviado' ? 'Enviado' : 'Atrasado'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
