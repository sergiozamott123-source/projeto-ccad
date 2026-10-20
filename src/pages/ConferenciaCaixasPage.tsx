import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, ChevronDown, ChevronUp, AlertTriangle, Boxes, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Caixa, ConfigArquivamentoFinal } from '@/lib/database.types'
import { DecisaoBadge } from '@/components/badges/DecisaoBadges'
import clsx from 'clsx'

// Caixas finais por setor — "poços de arquivamento" (10/10/2026)
// Ver claude/plano-caixas-finais-poco-setor.md no projeto para o desenho
// completo e o histórico da conversa com o Sérgio sobre esta feature.
//
// Antes, esta tela mostrava uma caixa de entrada (CX009, por exemplo) à
// espera de UM número final só pra ela. Hoje, uma caixa de entrada que
// termina a avaliação é distribuída SOZINHA (gatilho no banco, sem ação
// manual) para "poços" — um poço por combinação (setor, destinação) — que
// vão acumulando processos de VÁRIAS caixas de entrada diferentes ao
// longo do tempo, até juntar um volume que justifique montar uma caixa
// física de verdade para o Arquivo Geral. Esta tela mostra esses poços
// abertos, com destaque para os que já atingiram o volume mínimo
// configurado (tela Equipe & Responsáveis), e permite ao Protocolo
// conferir os códigos e aplicar o número definitivo a qualquer momento —
// mesmo antes do mínimo, se achar melhor.

type ProcessoPoco = {
  id: string
  numero_documento: string
  assunto_processo: string | null
  ttd: { codigo: string; assunto: string } | null
  avaliacoes: { decisao: string; status: string }[]
}

type Poco = Caixa & { processos: ProcessoPoco[] }

export function ConferenciaCaixasPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [numeroFinal, setNumeroFinal] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<Record<string, string>>({})

  const { data: config } = useQuery({
    queryKey: ['config-arquivamento-final'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('config_arquivamento_final')
        .select('*')
        .eq('id', true)
        .maybeSingle()
      if (error) throw error
      return data as ConfigArquivamentoFinal | null
    },
  })

  function minimoDe(destinacao: string | null) {
    if (!config) return null
    return destinacao === 'eliminacao'
      ? config.quantidade_minima_eliminacao
      : config.quantidade_minima_guarda_permanente
  }

  const { data: pocos, isLoading, isError, error: erroPocos } = useQuery({
    queryKey: ['pocos-arquivamento-abertos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caixas')
        .select(
          '*, processos!caixa_final_id(id, numero_documento, assunto_processo, ttd:ttd_codigo_id(codigo, assunto), avaliacoes(decisao, status))',
        )
        .eq('tipo', 'final')
        .eq('status', 'em_construcao')
        .order('setor', { ascending: true })
      if (error) throw error
      return (data ?? []) as Poco[]
    },
  })

  // Mesma segurança anti-duplicidade já usada antes (02/10/2026): a
  // sugestão do banco é buscada uma única vez, e cada poço pendente na
  // tela recebe um número sequencial diferente (base, base+1, base+2...),
  // levando em conta também os números já mostrados na tela para outros
  // poços ainda não fechados.
  const { data: sugestaoBase } = useQuery({
    queryKey: ['numero-sugerido-base', (pocos ?? []).map(p => p.id).join(',')],
    queryFn: async () => {
      const { data } = await supabase.rpc('sugerir_numero_caixa_final')
      return (data as string | null) ?? null
    },
    enabled: (pocos ?? []).length > 0,
  })

  useEffect(() => {
    if (!pocos || sugestaoBase === undefined) return
    setNumeroFinal(prev => {
      const faltantes = pocos.filter(p => !prev[p.id])
      if (faltantes.length === 0) return prev

      const numerosNaTela = Object.values(prev).map(Number).filter(n => Number.isFinite(n))
      const baseRpc = sugestaoBase != null ? Number(sugestaoBase) : NaN
      const candidatos = [baseRpc, ...numerosNaTela.map(n => n + 1)].filter(Number.isFinite)
      let proximo = candidatos.length > 0 ? Math.max(...candidatos) : null

      const atualizado = { ...prev }
      for (const p of faltantes) {
        if (proximo !== null) {
          atualizado[p.id] = String(proximo)
          proximo += 1
        } else if (sugestaoBase) {
          atualizado[p.id] = sugestaoBase
        }
      }
      return atualizado
    })
  }, [sugestaoBase, pocos])

  const fecharPoco = useMutation({
    mutationFn: async (pocoId: string) => {
      const numero = (numeroFinal[pocoId] ?? '').trim()
      if (!numero || !profile) throw new Error('Informe o número da caixa no Arquivo Geral.')

      // 1ª camada: confere antes de salvar se o número já está em uso por
      // qualquer outra caixa já arquivada — cobre tanto poços novos quanto
      // caixas arquivadas do jeito antigo (antes desta feature), já que as
      // duas coisas vivem na mesma tabela `caixas`.
      const { data: existente, error: erroConsulta } = await supabase
        .from('caixas')
        .select('id')
        .eq('numero', numero)
        .eq('status', 'arquivada')
        .neq('id', pocoId)
        .maybeSingle()
      if (erroConsulta) throw erroConsulta
      if (existente) {
        throw new Error(`O número ${numero} já está sendo usado por outra caixa arquivada. Escolha outro número.`)
      }

      const { error } = await supabase
        .from('caixas')
        .update({ numero, status: 'arquivada', conferido_por: profile.id, conferido_em: new Date().toISOString() })
        .eq('id', pocoId)
      if (error) {
        // 2ª camada: trava do próprio banco (índice único em caixas.numero
        // onde status = 'arquivada') — pega o caso raro de duas pessoas
        // confirmando o mesmo número quase ao mesmo tempo.
        if ((error as any).code === '23505') {
          throw new Error(
            `O número ${numero} acabou de ser usado por outra caixa (confirmada agora mesmo por outra pessoa). Escolha outro número.`,
          )
        }
        throw error
      }
    },
    onSuccess: (_data, pocoId) => {
      qc.invalidateQueries({ queryKey: ['pocos-arquivamento-abertos'] })
      qc.invalidateQueries({ queryKey: ['pocos-arquivamento-prontos-count'] })
      setErro(prev => ({ ...prev, [pocoId]: '' }))
    },
    onError: (e: any, pocoId) => {
      setErro(prev => ({ ...prev, [pocoId]: e?.message || 'Erro ao confirmar. Tente novamente.' }))
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conferência de Caixas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Poços de arquivamento final — processos já avaliados, agrupados por setor e destinação, acumulando até
          juntar volume suficiente para virarem uma caixa definitiva no Arquivo Geral.
        </p>
      </div>

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : isError ? (
          <div className="text-center py-10">
            <AlertTriangle size={36} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-600 text-sm font-medium">Não foi possível carregar os poços.</p>
            <p className="text-gray-400 text-xs mt-1">
              {(erroPocos as any)?.message || 'Erro desconhecido ao consultar o banco de dados.'}
            </p>
          </div>
        ) : (pocos ?? []).length === 0 ? (
          <div className="text-center py-10">
            <PackageCheck size={36} className="text-teal-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhum poço de arquivamento aberto no momento.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(pocos ?? []).map(p => {
              const totalProcessos = p.processos?.length ?? 0
              const minimo = minimoDe(p.destinacao)
              const pronto = minimo != null && totalProcessos >= minimo
              const percentual = minimo ? Math.min(100, Math.round((totalProcessos / minimo) * 100)) : 0
              const aberto = abertoId === p.id

              return (
                <div key={p.id} className="py-4 px-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono font-semibold text-gray-900 text-sm inline-flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400" /> {p.setor}
                        </span>
                        <DecisaoBadge destino={p.destinacao} />
                        {pronto && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium inline-flex items-center gap-1">
                            <Boxes size={12} /> Pronto para arquivar
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {totalProcessos} processo{totalProcessos === 1 ? '' : 's'} acumulado
                        {totalProcessos === 1 ? '' : 's'}
                        {minimo != null && ` · mínimo configurado: ${minimo}`}
                      </p>
                      {minimo != null && (
                        <div className="mt-1.5 w-56 max-w-full">
                          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={clsx('h-full rounded-full', pronto ? 'bg-orange-400' : 'bg-sky-400')}
                              style={{ width: `${percentual}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-700 text-xs font-medium inline-flex items-center gap-1 shrink-0"
                      onClick={() => setAbertoId(aberto ? null : p.id)}
                    >
                      {aberto ? <>Ver menos <ChevronUp size={12} /></> : <>Conferir códigos <ChevronDown size={12} /></>}
                    </button>
                  </div>

                  {aberto && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg divide-y divide-gray-200">
                      {(p.processos ?? []).map(proc => {
                        const aval = (proc.avaliacoes ?? []).find(a => a.status === 'confirmada') ?? proc.avaliacoes?.[0]
                        return (
                          <div key={proc.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-gray-800">{proc.numero_documento}</span>
                              {proc.assunto_processo && <span className="text-gray-500 ml-2 truncate">{proc.assunto_processo}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-gray-700">{proc.ttd?.codigo ?? '—'}</span>
                              <DecisaoBadge destino={aval?.decisao} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="label">Número da caixa no Arquivo Geral</label>
                      <input
                        className="input w-40 font-mono"
                        value={numeroFinal[p.id] ?? ''}
                        onChange={e => setNumeroFinal(prev => ({ ...prev, [p.id]: e.target.value }))}
                      />
                    </div>
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={!(numeroFinal[p.id] ?? '').trim() || fecharPoco.isPending}
                      onClick={() => fecharPoco.mutate(p.id)}
                    >
                      <PackageCheck size={13} /> Aplicar número e arquivar
                    </button>
                    {erro[p.id] && <p className="text-xs text-red-600 w-full">{erro[p.id]}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
