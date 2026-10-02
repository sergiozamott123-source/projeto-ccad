import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { Caixa, RequisicaoAvaliacao } from '@/lib/database.types'

type ProcessoConferencia = {
  id: string
  numero_documento: string
  assunto_processo: string | null
  setor_origem: string | null
  // ttd_codigo_id é coluna de `processos`, não de `avaliacoes` (ver
  // database.types.ts) — por isso o ttd é embedado aqui, como irmão de
  // `avaliacoes`, e não dentro dela. Corrigido em 02/10/2026: a consulta
  // antiga pedia `avaliacoes(... ttd:ttd_codigo_id(...))`, uma relação que
  // nunca existiu, e por isso o PostgREST sempre recusava essa consulta —
  // para QUALQUER usuário, não só a Ariadne. Esse erro, antes, ficava
  // escondido porque a tela só verificava "lista vazia", nunca "deu erro"
  // (ver isError abaixo), então aparentava só "nenhuma caixa pendente".
  ttd: { codigo: string; assunto: string } | null
  avaliacoes: { decisao: string; status: string }[]
}

type CaixaConferencia = Caixa & {
  requisicoes_avaliacao: (RequisicaoAvaliacao & { avaliador: { nome: string } | null })[]
  processos: ProcessoConferencia[]
}

// Uma caixa entra na fila de conferência quando a requisição
// correspondente já está 'concluida' (todo processo avaliado) — o
// próprio banco já marca a caixa como 'aguardando_conferencia' nesse
// momento (trigger da Fase 14).
export function ConferenciaCaixasPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [numeroFinal, setNumeroFinal] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<Record<string, string>>({})

  const { data: caixas, isLoading, isError, error: erroCaixas } = useQuery({
    queryKey: ['caixas-aguardando-conferencia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caixas')
        .select(
          '*, requisicoes_avaliacao(*, avaliador:avaliador_id(nome)), processos(id, numero_documento, assunto_processo, setor_origem, ttd:ttd_codigo_id(codigo, assunto), avaliacoes(decisao, status))',
        )
        .eq('status', 'aguardando_conferencia')
        .order('created_at', { ascending: true, referencedTable: 'requisicoes_avaliacao' })
      if (error) throw error
      return (data ?? []) as CaixaConferencia[]
    },
  })

  // Segurança na numeração (pedido do Sérgio, 02/10/2026): antes, cada
  // caixa pendente chamava sugerir_numero_caixa_final() por conta própria
  // e todas recebiam a MESMA resposta (porque nenhuma tinha sido
  // confirmada ainda, então o "maior número já usado" no banco não mudava
  // entre uma chamada e outra) — risco real de duas caixas serem
  // arquivadas com o mesmo número final.
  //
  // Agora a sugestão do banco é buscada só uma vez (uma única base), e a
  // partir dela cada caixa pendente na tela recebe um número sequencial
  // diferente (base, base+1, base+2, ...). Além disso, ao calcular a
  // próxima sugestão nunca ignoramos os números que JÁ estão sendo
  // mostrados na tela para outras caixas ainda não confirmadas — isso
  // evita repetir um número mesmo que o banco ainda não saiba dele.
  const { data: sugestaoBase } = useQuery({
    queryKey: ['numero-sugerido-base', (caixas ?? []).map(c => c.id).join(',')],
    queryFn: async () => {
      const { data } = await supabase.rpc('sugerir_numero_caixa_final')
      return (data as string | null) ?? null
    },
    enabled: (caixas ?? []).length > 0,
  })

  useEffect(() => {
    if (!caixas || sugestaoBase === undefined) return
    setNumeroFinal(prev => {
      const faltantes = caixas.filter(c => !prev[c.id])
      if (faltantes.length === 0) return prev

      const numerosNaTela = Object.values(prev)
        .map(Number)
        .filter(n => Number.isFinite(n))
      const baseRpc = sugestaoBase != null ? Number(sugestaoBase) : NaN
      // Começa do maior entre: o que o banco sugeriu, e "1 a mais" que
      // qualquer número já exibido na tela (ainda não salvo).
      const candidatos = [baseRpc, ...numerosNaTela.map(n => n + 1)].filter(Number.isFinite)
      let proximo = candidatos.length > 0 ? Math.max(...candidatos) : null

      const atualizado = { ...prev }
      for (const c of faltantes) {
        if (proximo !== null) {
          atualizado[c.id] = String(proximo)
          proximo += 1
        } else if (sugestaoBase) {
          // Sugestão do banco não é um número puro (caso raro) — não dá
          // para somar sequencialmente; preenche só com o valor bruto e
          // deixa o Protocolo ajustar à mão se precisar repetir.
          atualizado[c.id] = sugestaoBase
        }
      }
      return atualizado
    })
  }, [sugestaoBase, caixas])

  const confirmar = useMutation({
    mutationFn: async (caixaId: string) => {
      const numero = (numeroFinal[caixaId] ?? '').trim()
      if (!numero || !profile) throw new Error('Informe o número da caixa no Arquivo Geral.')

      // 1ª camada de segurança: confere ANTES de salvar se esse número já
      // não está em uso por outra caixa já arquivada — cobre o caso de
      // alguém digitar um número manualmente por engano, mesmo com a
      // sugestão automática já sendo sequencial.
      const { data: existente, error: erroConsulta } = await supabase
        .from('caixas')
        .select('id')
        .eq('numero', numero)
        .eq('status', 'arquivada')
        .neq('id', caixaId)
        .maybeSingle()
      if (erroConsulta) throw erroConsulta
      if (existente) {
        throw new Error(`O número ${numero} já está sendo usado por outra caixa arquivada. Escolha outro número.`)
      }

      const { error } = await supabase
        .from('caixas')
        .update({ numero, status: 'arquivada', conferido_por: profile.id })
        .eq('id', caixaId)
      if (error) {
        // 2ª camada de segurança (trava do próprio banco, ver
        // migracao_trava_numero_caixa_unico.sql): código 23505 é a
        // recusa por violação de unicidade — acontece no caso raro de
        // duas pessoas confirmarem o mesmo número quase ao mesmo tempo,
        // que a checagem acima sozinha não consegue pegar.
        if ((error as any).code === '23505') {
          throw new Error(
            `O número ${numero} acabou de ser usado por outra caixa (confirmada agora mesmo por outra pessoa). Escolha outro número.`,
          )
        }
        throw error
      }
    },
    onSuccess: (_data, caixaId) => {
      qc.invalidateQueries({ queryKey: ['caixas-aguardando-conferencia'] })
      // O contador da "bolinha" no menu (AppLayout.tsx) é uma consulta
      // separada, com sua própria queryKey — sem invalidar ela aqui também,
      // o número do menu fica "preso" no valor antigo até a página inteira
      // ser recarregada, mesmo com a lista desta tela já atualizada.
      qc.invalidateQueries({ queryKey: ['caixas-conferencia-pendentes-count'] })
      setErro(prev => ({ ...prev, [caixaId]: '' }))
    },
    onError: (e: any, caixaId) => {
      setErro(prev => ({ ...prev, [caixaId]: e?.message || 'Erro ao confirmar. Tente novamente.' }))
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conferência de Caixas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Caixas com a avaliação concluída, aguardando conferência do Protocolo antes de irem para o Arquivo Geral.
        </p>
      </div>

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : isError ? (
          <div className="text-center py-10">
            <AlertTriangle size={36} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-600 text-sm font-medium">Não foi possível carregar as caixas.</p>
            <p className="text-gray-400 text-xs mt-1">
              {(erroCaixas as any)?.message || 'Erro desconhecido ao consultar o banco de dados.'}
            </p>
          </div>
        ) : (caixas ?? []).length === 0 ? (
          <div className="text-center py-10">
            <PackageCheck size={36} className="text-teal-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma caixa aguardando conferência no momento.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(caixas ?? []).map(c => {
              const requisicao = c.requisicoes_avaliacao?.[0]
              const totalProcessos = c.processos?.length ?? 0
              const divergeQtd = c.quantidade_declarada != null && c.quantidade_declarada !== totalProcessos
              const aberta = abertaId === c.id
              // A caixa pode ter processos de mais de um setor — mostra o
              // setor único quando é o caso, ou avisa que é mista (o setor
              // de cada processo aparece na lista abaixo, ao abrir "Conferir
              // códigos").
              const setoresDaCaixa = Array.from(
                new Set((c.processos ?? []).map(p => p.setor_origem).filter((s): s is string => !!s)),
              ).sort()
              const setorMisto = setoresDaCaixa.length > 1

              return (
                <div key={c.id} className="py-4 px-2">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono font-semibold text-gray-900 text-sm">{c.numero}</span>
                        {setorMisto ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium"
                            title={`Setores desta caixa: ${setoresDaCaixa.join(', ')}`}
                          >
                            Múltiplos setores ({setoresDaCaixa.join(', ')})
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                            {setoresDaCaixa[0] ?? c.setor ?? '—'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        Avaliado por {requisicao?.avaliador?.nome ?? '—'} · {totalProcessos} processo{totalProcessos === 1 ? '' : 's'}
                        {c.quantidade_declarada != null && ` (declarados: ${c.quantidade_declarada})`}
                        {requisicao?.concluida_em && ` · concluído em ${format(new Date(requisicao.concluida_em), 'dd/MM/yyyy HH:mm')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-700 text-xs font-medium inline-flex items-center gap-1 shrink-0"
                      onClick={() => setAbertaId(aberta ? null : c.id)}
                    >
                      {aberta ? <>Ver menos <ChevronUp size={12} /></> : <>Conferir códigos <ChevronDown size={12} /></>}
                    </button>
                  </div>

                  {divergeQtd && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle size={13} className="shrink-0" />
                      Quantidade declarada na entrada ({c.quantidade_declarada}) diferente da quantidade avaliada ({totalProcessos}).
                    </p>
                  )}

                  {aberta && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg divide-y divide-gray-200">
                      {(c.processos ?? []).map(p => {
                        const aval = p.avaliacoes?.[0]
                        return (
                          <div key={p.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <span className="font-mono font-semibold text-gray-800">{p.numero_documento}</span>
                              {setorMisto && p.setor_origem && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 ml-2">{p.setor_origem}</span>
                              )}
                              {p.assunto_processo && <span className="text-gray-500 ml-2 truncate">{p.assunto_processo}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-gray-700">{p.ttd?.codigo ?? '—'}</span>
                              <span
                                className={
                                  'px-2 py-0.5 rounded-full font-medium ' +
                                  (aval?.decisao?.toLowerCase().includes('elimin')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-teal-100 text-teal-700')
                                }
                              >
                                {aval?.decisao ?? '—'}
                              </span>
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
                        value={numeroFinal[c.id] ?? ''}
                        onChange={e => setNumeroFinal(prev => ({ ...prev, [c.id]: e.target.value }))}
                      />
                    </div>
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={!(numeroFinal[c.id] ?? '').trim() || confirmar.isPending}
                      onClick={() => confirmar.mutate(c.id)}
                    >
                      <PackageCheck size={13} /> Confirmar e arquivar
                    </button>
                    {erro[c.id] && <p className="text-xs text-red-600 w-full">{erro[c.id]}</p>}
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
