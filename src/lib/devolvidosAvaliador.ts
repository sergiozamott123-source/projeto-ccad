// Processos devolvidos pela Coordenação ao avaliador (botão "Devolver" em
// Confirmar Eliminações). Existe porque a requisição da caixa costuma já
// estar "concluída" quando a devolução acontece, e então a caixa sai da
// lista "Requisições pendentes para você" — o avaliador não tinha como
// achar o processo devolvido. Aqui a lista nasce das próprias avaliações
// devolvidas, sem depender do status da requisição.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface LinhaDevolvida {
  id: string
  processo_id: string
  motivo_devolucao: string | null
  confirmado_em: string | null
  created_at: string
  processo: { numero_documento: string; caixa: { numero: string } | null } | null
  devolvido_por: { nome: string } | null
}

export interface CaixaComDevolvidos {
  caixaNumero: string
  processoIds: string[]
  total: number
  motivo: string | null
  devolvidoPor: string | null
  devolvidoEm: string | null
}

/** O Supabase às vezes devolve uma relação como lista de 1 item. */
function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function dataDaLinha(l: LinhaDevolvida): string {
  return l.confirmado_em ?? l.created_at
}

/**
 * Regra: um processo está "devolvido e pendente" quando tem avaliação
 * devolvida e NÃO tem nenhuma avaliação válida (confirmada ou aguardando
 * confirmação) — ou seja, ainda não foi refeito. Só vale a devolução mais
 * recente de cada processo. Agrupa por caixa, a mais recente primeiro.
 */
export function agruparDevolvidos(
  linhas: LinhaDevolvida[],
  processosJaResolvidos: Set<string>,
): CaixaComDevolvidos[] {
  const maisRecentePorProcesso = new Map<string, LinhaDevolvida>()
  for (const l of linhas) {
    if (processosJaResolvidos.has(l.processo_id)) continue
    const atual = maisRecentePorProcesso.get(l.processo_id)
    if (!atual || dataDaLinha(l) > dataDaLinha(atual)) maisRecentePorProcesso.set(l.processo_id, l)
  }

  const porCaixa = new Map<string, LinhaDevolvida[]>()
  for (const l of maisRecentePorProcesso.values()) {
    const proc = um(l.processo)
    const caixa = proc ? um(proc.caixa) : null
    const numero = caixa?.numero ?? null
    if (!numero) continue
    if (!porCaixa.has(numero)) porCaixa.set(numero, [])
    porCaixa.get(numero)!.push(l)
  }

  const grupos: CaixaComDevolvidos[] = []
  for (const [caixaNumero, itens] of porCaixa) {
    itens.sort((a, b) => (dataDaLinha(b) > dataDaLinha(a) ? 1 : -1))
    const recente = itens[0]
    grupos.push({
      caixaNumero,
      processoIds: itens.map(i => i.processo_id),
      total: itens.length,
      motivo: recente.motivo_devolucao,
      devolvidoPor: um(recente.devolvido_por)?.nome ?? null,
      devolvidoEm: dataDaLinha(recente),
    })
  }
  grupos.sort((a, b) => ((b.devolvidoEm ?? '') > (a.devolvidoEm ?? '') ? 1 : -1))
  return grupos
}

export function totalDevolvidos(grupos: CaixaComDevolvidos[]): number {
  return grupos.reduce((soma, g) => soma + g.total, 0)
}

const TAMANHO_LOTE = 100 // o Supabase manda os filtros na URL; lotes evitam URL longa demais

export function useDevolvidosDoAvaliador() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['devolvidos-avaliador', profile?.id],
    queryFn: async (): Promise<CaixaComDevolvidos[]> => {
      const { data } = await supabase
        .from('avaliacoes')
        .select(
          'id, processo_id, motivo_devolucao, confirmado_em, created_at, processo:processo_id(numero_documento, caixa:caixa_id(numero)), devolvido_por:confirmado_por(nome)',
        )
        .eq('avaliado_por', profile!.id)
        .eq('status', 'devolvida')
        .order('confirmado_em', { ascending: false })
        .limit(500)
      const linhas = (data ?? []) as unknown as LinhaDevolvida[]
      if (linhas.length === 0) return []

      const ids = Array.from(new Set(linhas.map(l => l.processo_id)))
      const resolvidos = new Set<string>()
      for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
        const { data: validas } = await supabase
          .from('avaliacoes')
          .select('processo_id')
          .in('processo_id', ids.slice(i, i + TAMANHO_LOTE))
          .in('status', ['confirmada', 'aguardando_confirmacao'])
        for (const v of validas ?? []) resolvidos.add(v.processo_id as string)
      }
      return agruparDevolvidos(linhas, resolvidos)
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 30,
  })
}
