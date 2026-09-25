import { supabase } from '@/lib/supabase'

// Lógica de "quanto cada avaliador tem sob responsabilidade e quanto já
// avaliou", extraída do Dashboard (aba Avaliações, Etapa 4 do plano em
// claude/plano-dashboard-acompanhamento-avaliacoes.md) para um lugar só,
// usado tanto pela tabela "Desempenho por avaliador" do Dashboard quanto
// pelo Alerta de Ritmo de Avaliação (claude/plano-alerta-ritmo-avaliacoes.md).
//
// Por que extrair: essa conta já passou por três correções de bugs sutis
// (pares avaliador/caixa que trocam de responsável, corte de 1.000 linhas
// do Supabase, universo de contagem inconsistente — ver item 7 do plano do
// Dashboard). Duplicar essa lógica em dois lugares arriscaria reintroduzir
// algum desses bugs, ou fazer as duas telas mostrarem números diferentes
// para a mesma coisa.

export interface PeriodoRange {
  inicio: string
  fim: string | null
}

export interface DesempenhoAvaliador {
  id: string
  nome: string
  caixas: number
  processosAtribuidos: number
  processosAvaliados: number
  /** null = sem nenhuma caixa sob responsabilidade agora (não 0%, nem 100%) */
  percentual: number | null
  /**
   * Data de entrega (`requisicoes_avaliacao.data_entrega`) da caixa mais
   * antiga entre as que este avaliador ainda tem ativas hoje — o "início da
   * contagem" usado pelo Alerta de Ritmo de Avaliação. null quando ele não
   * tem nenhuma caixa ativa.
   */
  dataEntregaMaisAntiga: string | null
}

/**
 * Busca o desempenho de cada avaliador habilitado (`pode_avaliar_processos
 * = true`), opcionalmente restrito a caixas entregues dentro de um período
 * (mesmo filtro de período do Dashboard, por `data_entrega`). Sem período
 * (`periodoRange` omitido ou null), considera todas as caixas ativas —
 * é o que o Alerta de Ritmo de Avaliação usa, já que o ritmo é sobre a
 * situação atual, não sobre uma janela de tempo escolhida na tela.
 */
export async function buscarDesempenhoAvaliadores(periodoRange?: PeriodoRange | null): Promise<DesempenhoAvaliador[]> {
  const { data: avaliadoresData } = await supabase
    .from('usuarios')
    .select('id, nome')
    .eq('pode_avaliar_processos', true)
    .order('nome')
  const avaliadores = avaliadoresData ?? []
  if (avaliadores.length === 0) return []

  const avaliadorIds = avaliadores.map(a => a.id)

  // Caixas sob responsabilidade de cada um — requisição não cancelada =
  // responsabilidade vigente (`status in ('pendente','concluida')`). Com um
  // período selecionado, restringe às caixas entregues naquele intervalo.
  let requisicoesQuery = supabase
    .from('requisicoes_avaliacao')
    .select('avaliador_id, caixa_id, data_entrega')
    .in('avaliador_id', avaliadorIds)
    .in('status', ['pendente', 'concluida'])
  if (periodoRange) requisicoesQuery = requisicoesQuery.gte('data_entrega', periodoRange.inicio)
  if (periodoRange?.fim) requisicoesQuery = requisicoesQuery.lte('data_entrega', periodoRange.fim)
  const { data: requisicoesData } = await requisicoesQuery
  const requisicoes = requisicoesData ?? []

  // Um mesmo caixa pode ter requisição ativa para mais de um avaliador ao
  // mesmo tempo (ex.: já foi concluída por quem avaliou antes, e depois
  // reaberta/reatribuída a outra pessoa, sem cancelar a antiga). Por isso
  // guardamos os PARES (avaliador, caixa) — nunca "dono único da caixa" —
  // senão as avaliações de um deles somem da conta.
  const caixasPorAvaliador = new Map<string, Set<string>>()
  const dataMaisAntigaPorAvaliador = new Map<string, string>()
  const paresAtivos = new Set<string>()
  for (const r of requisicoes) {
    if (!caixasPorAvaliador.has(r.avaliador_id)) caixasPorAvaliador.set(r.avaliador_id, new Set())
    caixasPorAvaliador.get(r.avaliador_id)!.add(r.caixa_id)
    paresAtivos.add(`${r.avaliador_id}::${r.caixa_id}`)
    if (r.data_entrega) {
      const atual = dataMaisAntigaPorAvaliador.get(r.avaliador_id)
      if (!atual || r.data_entrega < atual) dataMaisAntigaPorAvaliador.set(r.avaliador_id, r.data_entrega)
    }
  }

  // Quantos processos existem em cada uma dessas caixas, e de qual caixa é
  // cada processo — numa consulta só, cruzada depois no navegador. Evita
  // uma consulta por avaliador.
  const todasCaixaIds = Array.from(new Set(requisicoes.map(r => r.caixa_id)))
  const processosPorCaixa = new Map<string, number>()
  if (todasCaixaIds.length > 0) {
    const { data: processosData } = await supabase.from('processos').select('id, caixa_id').in('caixa_id', todasCaixaIds)
    for (const p of processosData ?? []) {
      processosPorCaixa.set(p.caixa_id, (processosPorCaixa.get(p.caixa_id) ?? 0) + 1)
    }
  }

  // Quantos desses processos (só os que estão em caixa hoje sob
  // responsabilidade de alguém) cada avaliador já avaliou de fato
  // (confirmada ou aguardando confirmação — nunca devolvida). Importante:
  // isso NÃO é "quantas avaliações esse avaliador já fez na vida" — é só o
  // progresso dele nas caixas que estão com ele *agora*. A checagem é pelo
  // PAR (quem avaliou, caixa do processo) — não por "dono único da caixa" —
  // para não sumir com o trabalho de quem dividiu ou sucedeu outra pessoa
  // na mesma caixa.
  //
  // Filtramos aqui também por `todasCaixaIds` direto na consulta ao banco
  // (com o mesmo padrão !inner), em vez de trazer TODAS as avaliações do
  // sistema e filtrar só depois no navegador — a tabela `avaliacoes` já tem
  // milhares de linhas (inclusive histórico migrado desde 2005) e, sem esse
  // filtro, o Supabase devolve no máximo as primeiras 1000 linhas (limite
  // padrão de segurança da ferramenta), podendo cortar justamente as
  // avaliações mais recentes.
  const avaliadosPorAvaliador = new Map<string, number>()
  if (todasCaixaIds.length > 0) {
    const { data: avaliacoesData } = await supabase
      .from('avaliacoes')
      .select('avaliado_por, processo:processo_id!inner(caixa_id)')
      .in('avaliado_por', avaliadorIds)
      .in('status', ['confirmada', 'aguardando_confirmacao'])
      .in('processo.caixa_id', todasCaixaIds)
    for (const a of (avaliacoesData ?? []) as unknown as { avaliado_por: string; processo: { caixa_id: string } | null }[]) {
      const caixaId = a.processo?.caixa_id
      if (!caixaId || !paresAtivos.has(`${a.avaliado_por}::${caixaId}`)) continue
      avaliadosPorAvaliador.set(a.avaliado_por, (avaliadosPorAvaliador.get(a.avaliado_por) ?? 0) + 1)
    }
  }

  const linhas: DesempenhoAvaliador[] = avaliadores.map(a => {
    const caixaIdsDele = Array.from(caixasPorAvaliador.get(a.id) ?? [])
    const processosAtribuidos = caixaIdsDele.reduce((soma, cid) => soma + (processosPorCaixa.get(cid) ?? 0), 0)
    const processosAvaliados = avaliadosPorAvaliador.get(a.id) ?? 0
    // null = sem nenhuma caixa sob responsabilidade agora, então não há
    // "progresso" para calcular (evita mostrar 0% ou 100% sem sentido).
    const percentual = processosAtribuidos > 0 ? Math.min(100, Math.round((processosAvaliados / processosAtribuidos) * 100)) : null
    return {
      id: a.id,
      nome: a.nome,
      caixas: caixaIdsDele.length,
      processosAtribuidos,
      processosAvaliados,
      percentual,
      dataEntregaMaisAntiga: dataMaisAntigaPorAvaliador.get(a.id) ?? null,
    }
  })

  return linhas.sort((a, b) => (a.percentual ?? 101) - (b.percentual ?? 101))
}

// Alerta de Ritmo de Avaliação (claude/plano-alerta-ritmo-avaliacoes.md,
// Etapa 2) — regra definida pelo Sérgio em 23/09/2026: pelo menos 20% do
// que está sob responsabilidade de um avaliador precisa estar avaliado a
// cada 7 dias corridos, contando a partir da caixa mais antiga que ele
// ainda tem ativa. Nos primeiros 6 dias não há cobrança ainda (meta 0%).
const DIAS_POR_CICLO = 7
const META_POR_CICLO = 20 // pontos percentuais esperados a cada ciclo de DIAS_POR_CICLO dias

export interface StatusRitmoAvaliador extends DesempenhoAvaliador {
  /** Dias corridos desde a caixa mais antiga ativa; null se não há caixa ativa. */
  diasDesdeEntrega: number | null
  /** Percentual mínimo esperado hoje, pela regra dos 20% a cada 7 dias; null se não aplicável ainda. */
  metaEsperada: number | null
  /** true quando o percentual real está abaixo da meta esperada. */
  atrasado: boolean
}

/**
 * Aplica a regra de ritmo a um avaliador já calculado por
 * `buscarDesempenhoAvaliadores`. Compara só por data (sem hora), tanto na
 * entrega quanto em "hoje", para o resultado não mudar dependendo da hora
 * exata em que o Sérgio abre o sistema.
 */
export function calcularRitmo(d: DesempenhoAvaliador, hoje: Date = new Date()): StatusRitmoAvaliador {
  if (!d.dataEntregaMaisAntiga || d.percentual === null) {
    return { ...d, diasDesdeEntrega: null, metaEsperada: null, atrasado: false }
  }
  const dataEntrega = new Date(`${d.dataEntregaMaisAntiga}T00:00:00`)
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const diasDesdeEntrega = Math.floor((hojeSemHora.getTime() - dataEntrega.getTime()) / 86_400_000)

  if (diasDesdeEntrega < DIAS_POR_CICLO) {
    // Ainda dentro do primeiro ciclo: sem cobrança, mas já mostramos os
    // dias decorridos (útil de exibir, mesmo sem gerar alerta).
    return { ...d, diasDesdeEntrega, metaEsperada: 0, atrasado: false }
  }

  const ciclosCompletos = Math.floor(diasDesdeEntrega / DIAS_POR_CICLO)
  const metaEsperada = Math.min(100, ciclosCompletos * META_POR_CICLO)
  const atrasado = d.percentual < metaEsperada

  return { ...d, diasDesdeEntrega, metaEsperada, atrasado }
}

/**
 * Busca todos os avaliadores com caixa ativa e devolve só os que estão
 * abaixo do ritmo esperado, do mais atrasado para o menos atrasado. Não
 * aplica nenhum filtro de período — o ritmo é sobre a situação atual, não
 * sobre uma janela de tempo escolhida numa tela.
 */
export async function buscarAvaliadoresAtrasados(hoje: Date = new Date()): Promise<StatusRitmoAvaliador[]> {
  const desempenho = await buscarDesempenhoAvaliadores(null)
  return desempenho
    .map(d => calcularRitmo(d, hoje))
    .filter(d => d.atrasado)
    .sort((a, b) => (a.percentual ?? 0) - (b.percentual ?? 0))
}
