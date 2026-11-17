// Duas informações que o avaliador precisa ver na tela dele:
//
// 1) Caixas que ele JÁ TERMINOU de avaliar e deve devolver (fisicamente) ao
//    Protocolo. A requisição da caixa só é fechada pelo banco quando a
//    Coordenação confirma todas as eliminações (trava da Fase 19), e isso pode
//    demorar — enquanto isso os processos físicos ficariam com o avaliador.
//    Por isso aqui a regra é só da tela: a caixa está "concluída pelo
//    avaliador" quando TODO processo dela já tem uma avaliação válida
//    (aguardando confirmação ou confirmada). Nada muda no banco.
//
// 2) Processos cujo código foi CORRIGIDO pela Coordenação/Protocolo no ato da
//    conferência (a avaliação guarda o código que o avaliador usou em
//    `codigo_original_id`).
import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const TAMANHO_LOTE = 100 // o Supabase manda os filtros na URL; lotes evitam URL longa demais
const STATUS_VALIDOS = ['confirmada', 'aguardando_confirmacao']

/** O Supabase às vezes devolve uma relação como lista de 1 item. */
function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/** Caixa concluída pelo avaliador: tem processos e todos já têm avaliação válida. */
export function caixaConcluida(processoIds: string[], resolvidos: Set<string>): boolean {
  return processoIds.length > 0 && processoIds.every(id => resolvidos.has(id))
}

export interface CaixaParaDevolver {
  caixaId: string
  caixaNumero: string
  total: number
}

export function useCaixasParaDevolver() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['caixas-para-devolver', profile?.id],
    queryFn: async (): Promise<CaixaParaDevolver[]> => {
      const { data: reqs } = await supabase
        .from('requisicoes_avaliacao')
        .select('caixa_id, caixa:caixa_id(numero)')
        .eq('avaliador_id', profile!.id)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })

      const caixas = (reqs ?? []).map(r => ({
        caixaId: r.caixa_id as string,
        caixaNumero: um(r.caixa as { numero: string } | { numero: string }[] | null)?.numero ?? '—',
      }))

      const resultados = await Promise.all(
        caixas.map(async (c): Promise<CaixaParaDevolver | null> => {
          const { data: procs } = await supabase
            .from('processos')
            .select('id')
            .eq('caixa_id', c.caixaId)
            .limit(5000)
          const ids = (procs ?? []).map(p => p.id as string)
          if (ids.length === 0) return null

          const resolvidos = new Set<string>()
          for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
            const { data: validas } = await supabase
              .from('avaliacoes')
              .select('processo_id')
              .in('processo_id', ids.slice(i, i + TAMANHO_LOTE))
              .in('status', STATUS_VALIDOS)
            for (const v of validas ?? []) resolvidos.add(v.processo_id as string)
          }
          return caixaConcluida(ids, resolvidos)
            ? { caixaId: c.caixaId, caixaNumero: c.caixaNumero, total: ids.length }
            : null
        }),
      )
      return resultados.filter((r): r is CaixaParaDevolver => r !== null)
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 30,
  })
}

export interface CorrecaoDaCoordenacao {
  avaliacaoId: string
  processoId: string
  numeroProcesso: string
  caixaNumero: string | null
  codigoAvaliador: string
  assuntoAvaliador: string | null
  codigoAtual: string
  assuntoAtual: string | null
  corrigidoPor: string | null
  corrigidoEm: string | null
}

const DIAS_DAS_CORRECOES = 30

interface LinhaCorrecao {
  id: string
  processo_id: string
  codigo_original_id: string
  confirmado_em: string | null
  corrigido_por: { nome: string } | { nome: string }[] | null
  processo: {
    numero_documento: string
    ttd_codigo_id: string | null
    ttd: { codigo: string; assunto: string | null } | { codigo: string; assunto: string | null }[] | null
    caixa: { numero: string } | { numero: string }[] | null
  } | null
}

export function useCorrecoesDaCoordenacao() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['correcoes-da-coordenacao', profile?.id],
    queryFn: async (): Promise<CorrecaoDaCoordenacao[]> => {
      const desde = subDays(new Date(), DIAS_DAS_CORRECOES).toISOString()
      const { data } = await supabase
        .from('avaliacoes')
        .select(
          'id, processo_id, codigo_original_id, confirmado_em, corrigido_por:confirmado_por(nome), processo:processo_id(numero_documento, ttd_codigo_id, ttd:ttd_codigo_id(codigo, assunto), caixa:caixa_id(numero))',
        )
        .eq('avaliado_por', profile!.id)
        .eq('status', 'confirmada')
        .not('codigo_original_id', 'is', null)
        .gte('confirmado_em', desde)
        .order('confirmado_em', { ascending: false })
        .limit(200)
      const linhas = ((data ?? []) as unknown as LinhaCorrecao[]).filter(
        l => l.processo && l.codigo_original_id !== l.processo.ttd_codigo_id,
      )
      if (linhas.length === 0) return []

      // Os códigos originais são buscados à parte (não dependem de relação
      // cadastrada no banco): um código por linha, em lotes.
      const idsOriginais = Array.from(new Set(linhas.map(l => l.codigo_original_id)))
      const originais = new Map<string, { codigo: string; assunto: string | null }>()
      for (let i = 0; i < idsOriginais.length; i += TAMANHO_LOTE) {
        const { data: cods } = await supabase
          .from('ttd_codigos')
          .select('id, codigo, assunto')
          .in('id', idsOriginais.slice(i, i + TAMANHO_LOTE))
        for (const c of cods ?? []) {
          originais.set(c.id as string, { codigo: c.codigo as string, assunto: (c.assunto as string | null) ?? null })
        }
      }

      return linhas.map(l => {
        const proc = l.processo!
        const atual = um(proc.ttd)
        const orig = originais.get(l.codigo_original_id)
        return {
          avaliacaoId: l.id,
          processoId: l.processo_id,
          numeroProcesso: proc.numero_documento,
          caixaNumero: um(proc.caixa)?.numero ?? null,
          codigoAvaliador: orig?.codigo ?? '—',
          assuntoAvaliador: orig?.assunto ?? null,
          codigoAtual: atual?.codigo ?? '—',
          assuntoAtual: atual?.assunto ?? null,
          corrigidoPor: um(l.corrigido_por)?.nome ?? null,
          corrigidoEm: l.confirmado_em,
        }
      })
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60,
  })
}
