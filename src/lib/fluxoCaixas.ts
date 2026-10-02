import { supabase } from '@/lib/supabase'

// Fluxo das Caixas (pedido do Sérgio, 02/10/2026): uma caixa, desde que
// entra no sistema para avaliação até ser arquivada, passa por 4 momentos
// bem definidos — mas essa informação, até hoje, ficava "espalhada" entre
// várias tabelas (requisicoes_avaliacao, cepas, crpas, caixas) e várias
// telas diferentes, sem um lugar só que contasse a história completa.
// Esta função junta tudo isso numa lista só de "cartões", para alimentar o
// quadro visual de FluxoCaixasPage.tsx.
//
// As 4 etapas, e quem precisa agir em cada uma:
// 1. aguardando_cepa            — o Protocolo ainda não emitiu a CEPA
//    (Confirmação de Envio) daquela caixa (Fase 21).
// 2. aguardando_recebimento     — CEPA já emitida, mas o avaliador ainda
//    não confirmou que recebeu a caixa (gerando a CRPA).
// 3. em_avaliacao               — CRPA confirmada; o avaliador está
//    analisando os processos.
// 4. aguardando_conferencia     — todos os processos da caixa já foram
//    avaliados; falta o Protocolo conferir os códigos e definir o número
//    final de arquivo (Fase 14) antes dela ir fisicamente para o Arquivo
//    Geral.
//
// Caixas já arquivadas (etapa seguinte a esta) não entram aqui — decisão
// do Sérgio (02/10/2026): o quadro mostra só o que ainda precisa de ação.

export type EtapaFluxoCaixa = 'aguardando_cepa' | 'aguardando_recebimento' | 'em_avaliacao' | 'aguardando_conferencia'

export interface CaixaFluxo {
  caixaId: string
  numero: string
  setor: string
  avaliador: string
  etapa: EtapaFluxoCaixa
  /** Dias corridos desde que a caixa entrou nesta etapa específica. */
  diasNaEtapa: number
  /** Só preenchido na etapa 'em_avaliacao'; null nas demais etapas. */
  percentualAvaliado: number | null
}

function diasDesde(dataIso: string, hoje: Date): number {
  const data = new Date(`${dataIso.slice(0, 10)}T00:00:00`)
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.max(0, Math.floor((hojeSemHora.getTime() - data.getTime()) / 86_400_000))
}

export async function buscarFluxoCaixas(hoje: Date = new Date()): Promise<CaixaFluxo[]> {
  // 1) Requisições ainda ativas (nem concluídas, nem canceladas) — cobrem
  // as 3 primeiras etapas. Cada uma é, por definição, uma caixa só.
  const { data: requisicoesData } = await supabase
    .from('requisicoes_avaliacao')
    .select('id, caixa_id, avaliador_id, data_entrega, caixa:caixa_id(numero, setor), avaliador:avaliador_id(nome)')
    .eq('status', 'pendente')
  const requisicoes = (requisicoesData ?? []) as unknown as {
    id: string
    caixa_id: string
    avaliador_id: string
    data_entrega: string
    caixa: { numero: string; setor: string } | null
    avaliador: { nome: string } | null
  }[]
  const requisicaoIds = requisicoes.map(r => r.id)

  // 2) CEPA/CRPA de cada requisição ativa — decide em qual das 3 primeiras
  // etapas cada uma está.
  const statusCepaPorRequisicao = new Map<string, { temCrpa: boolean }>()
  if (requisicaoIds.length > 0) {
    const { data: cepasData } = await supabase
      .from('cepas')
      .select('requisicao_avaliacao_id, crpas(id)')
      .in('requisicao_avaliacao_id', requisicaoIds)
    for (const c of (cepasData ?? []) as unknown as {
      requisicao_avaliacao_id: string
      crpas: { id: string }[] | { id: string } | null
    }[]) {
      const crpa = Array.isArray(c.crpas) ? c.crpas[0] : c.crpas
      statusCepaPorRequisicao.set(c.requisicao_avaliacao_id, { temCrpa: !!crpa })
    }
  }

  // 3) Progresso de avaliação — só para as caixas já em avaliação (CRPA
  // confirmada). Mesmo cuidado já validado em desempenhoAvaliadores.ts:
  // nunca buscar avaliações sem filtrar por caixa (tabela grande, com
  // histórico migrado desde 2005).
  const caixasEmAvaliacaoIds = requisicoes
    .filter(r => statusCepaPorRequisicao.get(r.id)?.temCrpa)
    .map(r => r.caixa_id)

  const processosPorCaixa = new Map<string, number>()
  const avaliadosPorCaixa = new Map<string, number>()
  if (caixasEmAvaliacaoIds.length > 0) {
    const { data: processosData } = await supabase.from('processos').select('id, caixa_id').in('caixa_id', caixasEmAvaliacaoIds)
    for (const p of processosData ?? []) {
      processosPorCaixa.set(p.caixa_id, (processosPorCaixa.get(p.caixa_id) ?? 0) + 1)
    }
    const { data: avaliacoesData } = await supabase
      .from('avaliacoes')
      .select('processo:processo_id!inner(caixa_id)')
      .in('status', ['confirmada', 'aguardando_confirmacao'])
      .in('processo.caixa_id', caixasEmAvaliacaoIds)
    for (const a of (avaliacoesData ?? []) as unknown as { processo: { caixa_id: string } | null }[]) {
      const caixaId = a.processo?.caixa_id
      if (!caixaId) continue
      avaliadosPorCaixa.set(caixaId, (avaliadosPorCaixa.get(caixaId) ?? 0) + 1)
    }
  }

  const cartoesAtivos: CaixaFluxo[] = requisicoes.map(r => {
    const statusCepa = statusCepaPorRequisicao.get(r.id)
    let etapa: EtapaFluxoCaixa
    if (!statusCepa) etapa = 'aguardando_cepa'
    else if (!statusCepa.temCrpa) etapa = 'aguardando_recebimento'
    else etapa = 'em_avaliacao'

    const atribuidos = processosPorCaixa.get(r.caixa_id) ?? 0
    const avaliados = avaliadosPorCaixa.get(r.caixa_id) ?? 0
    const percentualAvaliado = etapa === 'em_avaliacao' && atribuidos > 0 ? Math.min(100, Math.round((avaliados / atribuidos) * 100)) : null

    return {
      caixaId: r.caixa_id,
      numero: r.caixa?.numero ?? '—',
      setor: r.caixa?.setor ?? '—',
      avaliador: r.avaliador?.nome ?? '—',
      etapa,
      diasNaEtapa: diasDesde(r.data_entrega, hoje),
      percentualAvaliado,
    }
  })

  // 4) Caixas aguardando a conferência final do Protocolo (Fase 14) — o
  // !inner garante que só vêm caixas cuja requisição realmente concluiu
  // (evita pegar, por engano, uma requisição antiga de outra pessoa).
  const { data: aguardandoConferenciaData } = await supabase
    .from('caixas')
    .select('id, numero, setor, requisicoes_avaliacao!inner(avaliador:avaliador_id(nome), concluida_em)')
    .eq('status', 'aguardando_conferencia')
    .eq('requisicoes_avaliacao.status', 'concluida')
  const cartoesConferencia: CaixaFluxo[] = (
    (aguardandoConferenciaData ?? []) as unknown as {
      id: string
      numero: string
      setor: string
      requisicoes_avaliacao: { avaliador: { nome: string } | null; concluida_em: string | null }[]
    }[]
  ).map(c => {
    const req = c.requisicoes_avaliacao?.[0]
    return {
      caixaId: c.id,
      numero: c.numero,
      setor: c.setor,
      avaliador: req?.avaliador?.nome ?? '—',
      etapa: 'aguardando_conferencia',
      diasNaEtapa: req?.concluida_em ? diasDesde(req.concluida_em, hoje) : 0,
      percentualAvaliado: null,
    }
  })

  return [...cartoesAtivos, ...cartoesConferencia]
}
