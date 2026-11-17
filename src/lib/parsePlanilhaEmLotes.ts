// Leitura da "Planilha Mãe" do Protocolo (Fase 20), que reúne várias
// caixas físicas — cada uma com processos de setores variados e um
// avaliador de destino — num único arquivo. Diferente da leitura
// simples (3 colunas fixas: número, ano, assunto), aqui as colunas são
// reconhecidas PELO NOME do cabeçalho, e podem vir em qualquer ordem;
// o cabeçalho também pode se repetir várias vezes ao longo da planilha
// (uma vez antes de cada caixa nova), então ele é procurado linha a
// linha, não só na primeira.
//
// Este arquivo não depende de XLSX nem de Supabase — só processa o
// array de linhas já lido pela tela (ver RequisicoesAvaliacaoPage.tsx,
// função `processarArquivo`). A lógica foi validada isoladamente com
// `node`, fora do React, contra uma planilha real do Protocolo antes
// de entrar aqui — dois erros reais foram encontrados e corrigidos
// nesse processo (posição da coluna do avaliador, e comparação de
// nomes compostos), documentados nos comentários abaixo.

export interface AvaliadorBasico {
  id: string
  nome: string
}

export interface ProcessoDetectado {
  numero: string
  ano: string
  assunto: string
  setorOrigem: string
  dataDespacho: string // 'yyyy-MM-dd', ou '' se a planilha não trouxe essa coluna/valor
}

export type StatusMatchAvaliador = 'ok' | 'em_branco' | 'nao_encontrado' | 'ambiguo'

export interface LoteDetectado {
  numeroFisico: string
  avaliadorBruto: string
  avaliadorId: string | null
  statusMatch: StatusMatchAvaliador
  processos: ProcessoDetectado[]
  setores: string[]
}

export function normalizarTexto(s: unknown): string {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ºª°.,:;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type CampoColuna = 'caixa' | 'setor' | 'processo' | 'ano' | 'assunto' | 'dataDespacho' | 'avaliador'

// Nomes de cabeçalho aceitos por coluna (a comparação já ignora
// maiúscula/minúscula, acento e pontuação — "Departº" e "Depart." já
// viram a mesma coisa antes de chegar aqui). A ordem das colunas na
// planilha não importa: cada uma é procurada pelo nome.
const CANDIDATOS_COLUNA: Record<Exclude<CampoColuna, 'avaliador'>, string[]> = {
  caixa: ['caixa'],
  setor: ['setor'],
  processo: ['processo', 'no processo', 'n processo', 'numero', 'numero do processo'],
  ano: ['ano'],
  assunto: ['descricao', 'assunto'],
  dataDespacho: ['data despacho', 'data do despacho'],
}

// A coluna do avaliador não tem um nome de cabeçalho fixo na planilha
// real: às vezes vem em branco, às vezes com um rótulo como "MEMBRO".
// Por isso ela não é procurada pelo nome como as outras — é assumida
// como a coluna logo depois de CAIXA, e só quando essa coluna vizinha
// não foi reconhecida como outro campo qualquer (ver detectarCabecalho).
const CANDIDATOS_AVALIADOR = ['membro', 'avaliador', 'responsavel', 'nome']

type MapaCabecalho = Partial<Record<CampoColuna, number>>

// Detecta se uma linha é uma linha de cabeçalho (pode aparecer mais de
// uma vez na "Planilha Mãe", repetida antes de cada caixa nova) e, se
// for, devolve o mapa {campo: índice da coluna}.
function detectarCabecalho(linha: unknown[]): MapaCabecalho | null {
  const normalizada = linha.map(normalizarTexto)
  const mapa: MapaCabecalho = {}
  let achouProcessoOuSetor = false

  for (const campo of Object.keys(CANDIDATOS_COLUNA) as (keyof typeof CANDIDATOS_COLUNA)[]) {
    const candidatos = CANDIDATOS_COLUNA[campo]
    const idx = normalizada.findIndex(c => candidatos.includes(c))
    if (idx !== -1) {
      mapa[campo] = idx
      if (campo === 'processo' || campo === 'setor') achouProcessoOuSetor = true
    }
  }

  if (mapa.caixa !== undefined) {
    const idxVizinho = mapa.caixa + 1
    const jaUsado = Object.values(mapa).includes(idxVizinho)
    const headerVizinho = normalizada[idxVizinho]
    const vizinhoAceitavel = !headerVizinho || CANDIDATOS_AVALIADOR.includes(headerVizinho)
    if (!jaUsado && vizinhoAceitavel && idxVizinho < linha.length) {
      mapa.avaliador = idxVizinho
    }
  }

  return achouProcessoOuSetor ? mapa : null
}

// Resolve o ano no mesmo formato que a tela já usa: separa o ano
// numérico de um eventual complemento em letra (ex.: "1991-A" ->
// "1991-A"; "1991a" -> "1991-A").
function separarAno(valor: unknown): string {
  const texto = String(valor ?? '').trim()
  const m = texto.match(/^(\d{4})\s*-?\s*([A-Za-z].*)?$/)
  if (!m) return texto
  return m[1] + (m[2] ? '-' + m[2].trim().toUpperCase() : '')
}

// Converte uma célula de data para 'yyyy-MM-dd'. A leitura da planilha
// (ver RequisicoesAvaliacaoPage.tsx) usa `XLSX.read(..., { cellDates:
// true })`, então uma célula de data chega aqui como objeto Date.
function paraDataIso(valor: unknown): string {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10)
  }
  return ''
}

// Compara o nome de avaliador escrito na planilha (às vezes só o
// primeiro nome, ex. "Jennifer"; às vezes nome e sobrenome, ex.
// "Cláudia Solares") contra a lista de avaliadores cadastrados (nome
// completo). Só considera "identificado" quando existe exatamente UM
// avaliador cujo nome completo contém, como palavras inteiras, TODAS
// as palavras escritas na planilha — nunca adivinha em caso de
// ambiguidade (dois avaliadores compatíveis) ou de zero resultado.
//
// (Corrigido durante os testes: a primeira versão comparava a string
// inteira digitada contra uma lista de palavras soltas do nome
// cadastrado, o que nunca dava certo para nomes com mais de uma
// palavra, como "Cláudia Solares".)
export function encontrarAvaliador(
  nomeNaPlanilha: string,
  avaliadores: AvaliadorBasico[],
): { avaliadorId: string | null; motivo: StatusMatchAvaliador } {
  const alvo = normalizarTexto(nomeNaPlanilha)
  if (!alvo) return { avaliadorId: null, motivo: 'em_branco' }
  const alvoPalavras = alvo.split(' ').filter(Boolean)

  const candidatos = avaliadores.filter(a => {
    const nomePalavras = normalizarTexto(a.nome).split(' ')
    return alvoPalavras.every(p => nomePalavras.includes(p))
  })

  if (candidatos.length === 1) return { avaliadorId: candidatos[0].id, motivo: 'ok' }
  if (candidatos.length === 0) return { avaliadorId: null, motivo: 'nao_encontrado' }
  return { avaliadorId: null, motivo: 'ambiguo' }
}

// ---------------------------------------------------------------
// Avisos da leitura (tela "Distribuição de caixas")
// ---------------------------------------------------------------
// A leitura original pulava, em silêncio, tudo o que não entendia
// (linha sem número de caixa, cabeçalho com nome diferente, etc.).
// Para quem está enviando as caixas isso é perigoso: a caixa parece
// lida por inteiro quando não foi. Agora cada situação vira um aviso
// que a tela mostra em linguagem simples. `parsePlanilhaEmLotes`
// (usada pela tela antiga de Requisições) continua devolvendo
// exatamente o mesmo resultado de antes.
export type TipoAvisoPlanilha =
  | 'sem_cabecalho'
  | 'sem_coluna_caixa'
  | 'sem_coluna_processo'
  | 'linha_sem_caixa'
  | 'linha_sem_processo'
  | 'caixa_em_blocos_separados'
  | 'processo_repetido_na_caixa'
  | 'processo_em_mais_de_uma_caixa'

export interface AvisoPlanilha {
  tipo: TipoAvisoPlanilha
  /** Número da linha como aparece no Excel (quando a tela informa onde a leitura começou). */
  linhaExcel?: number
  caixa?: string
  processo?: string
  /** Texto de apoio (ex.: o conteúdo da linha ignorada, ou a outra caixa onde o processo também aparece). */
  detalhe?: string
}

export interface ResultadoLeituraPlanilha {
  lotes: LoteDetectado[] | null
  avisos: AvisoPlanilha[]
  /** Células da primeira linha preenchida — ajuda a explicar "não achei a coluna X". */
  colunasVistas: string[]
}

/**
 * Igual a `parsePlanilhaEmLotes`, mas também devolve os avisos sobre o
 * que foi ignorado ou parece estranho. `primeiraLinhaExcel` é o número
 * (no Excel) da primeira linha de `linhasBrutas`; só é exato quando a
 * planilha foi lida com `blankrows: true` (linhas vazias preservadas).
 */
export function lerPlanilhaEmLotes(
  linhasBrutas: unknown[][],
  avaliadores: AvaliadorBasico[],
  primeiraLinhaExcel = 1,
): ResultadoLeituraPlanilha {
  let cabecalhoAtual: MapaCabecalho | null = null
  const gruposPorCaixa = new Map<string, { avaliadorBruto: string; processos: ProcessoDetectado[]; setores: Set<string> }>()
  const avisos: AvisoPlanilha[] = []
  let algumCabecalhoEncontrado = false
  let colunasVistas: string[] = []
  let ultimaCaixa = ''
  const caixasJaAvisadasEmBlocos = new Set<string>()
  const processoPrimeiraCaixa = new Map<string, string>()
  const processosJaAvisadosEmOutraCaixa = new Set<string>()
  let avisouSemCaixa = false
  let avisouSemProcesso = false

  linhasBrutas.forEach((linha, idx) => {
    const linhaExcel = primeiraLinhaExcel + idx
    if (!linha || linha.every(c => c === undefined || c === null || String(c).trim() === '')) return

    // Guarda a primeira linha com pelo menos 2 células preenchidas (uma
    // linha de título solta, com 1 célula só, não ajuda a explicar nada).
    if (colunasVistas.length === 0) {
      const celulas = linha.map(c => String(c ?? '').trim()).filter(Boolean)
      if (celulas.length >= 2) colunasVistas = celulas
    }

    const possivelCabecalho = detectarCabecalho(linha)
    if (possivelCabecalho) {
      cabecalhoAtual = possivelCabecalho
      algumCabecalhoEncontrado = true
      if (cabecalhoAtual.caixa === undefined && !avisouSemCaixa) {
        avisouSemCaixa = true
        avisos.push({ tipo: 'sem_coluna_caixa', linhaExcel })
      }
      if (cabecalhoAtual.processo === undefined && !avisouSemProcesso) {
        avisouSemProcesso = true
        avisos.push({ tipo: 'sem_coluna_processo', linhaExcel })
      }
      return
    }
    if (!cabecalhoAtual || cabecalhoAtual.caixa === undefined || cabecalhoAtual.processo === undefined) return

    const numeroFisico = String(linha[cabecalhoAtual.caixa] ?? '').trim()
    const numeroProcesso = String(linha[cabecalhoAtual.processo] ?? '').trim()
    if (!numeroFisico || !numeroProcesso) {
      const primeiraCelula = linha.map(c => String(c ?? '').trim()).find(Boolean) ?? ''
      if (!numeroProcesso) {
        avisos.push({ tipo: 'linha_sem_processo', linhaExcel, caixa: numeroFisico || undefined, detalhe: primeiraCelula })
      } else {
        avisos.push({ tipo: 'linha_sem_caixa', linhaExcel, processo: numeroProcesso })
      }
      return
    }

    const setorBruto = cabecalhoAtual.setor !== undefined ? String(linha[cabecalhoAtual.setor] ?? '').trim() : ''
    const avaliadorBruto = cabecalhoAtual.avaliador !== undefined ? String(linha[cabecalhoAtual.avaliador] ?? '').trim() : ''
    const ano = separarAno(cabecalhoAtual.ano !== undefined ? linha[cabecalhoAtual.ano] : '')
    const assunto = cabecalhoAtual.assunto !== undefined ? String(linha[cabecalhoAtual.assunto] ?? '').trim() : ''
    const dataDespacho = cabecalhoAtual.dataDespacho !== undefined ? paraDataIso(linha[cabecalhoAtual.dataDespacho]) : ''

    if (!gruposPorCaixa.has(numeroFisico)) {
      gruposPorCaixa.set(numeroFisico, { avaliadorBruto, processos: [], setores: new Set() })
    } else if (numeroFisico !== ultimaCaixa && !caixasJaAvisadasEmBlocos.has(numeroFisico)) {
      // A caixa já tinha aparecido antes e outra caixa veio no meio: os
      // dois trechos são somados numa caixa só — vale conferir.
      caixasJaAvisadasEmBlocos.add(numeroFisico)
      avisos.push({ tipo: 'caixa_em_blocos_separados', linhaExcel, caixa: numeroFisico })
    }
    ultimaCaixa = numeroFisico
    const grupo = gruposPorCaixa.get(numeroFisico)!

    const chaveProcesso = `${numeroProcesso}|${ano}`
    if (grupo.processos.some(p => `${p.numero}|${p.ano}` === chaveProcesso)) {
      avisos.push({ tipo: 'processo_repetido_na_caixa', linhaExcel, caixa: numeroFisico, processo: numeroProcesso })
    }
    const primeiraCaixaDoProcesso = processoPrimeiraCaixa.get(chaveProcesso)
    if (primeiraCaixaDoProcesso === undefined) {
      processoPrimeiraCaixa.set(chaveProcesso, numeroFisico)
    } else if (primeiraCaixaDoProcesso !== numeroFisico && !processosJaAvisadosEmOutraCaixa.has(chaveProcesso)) {
      processosJaAvisadosEmOutraCaixa.add(chaveProcesso)
      avisos.push({ tipo: 'processo_em_mais_de_uma_caixa', linhaExcel, caixa: numeroFisico, processo: numeroProcesso, detalhe: primeiraCaixaDoProcesso })
    }

    grupo.processos.push({ numero: numeroProcesso, ano, assunto, setorOrigem: setorBruto, dataDespacho })
    if (setorBruto) grupo.setores.add(setorBruto)
  })

  if (!algumCabecalhoEncontrado) avisos.unshift({ tipo: 'sem_cabecalho' })

  if (!algumCabecalhoEncontrado || gruposPorCaixa.size === 0) return { lotes: null, avisos, colunasVistas }

  const lotes = [...gruposPorCaixa.entries()].map(([numeroFisico, g]) => {
    const match = encontrarAvaliador(g.avaliadorBruto, avaliadores)
    return {
      numeroFisico,
      avaliadorBruto: g.avaliadorBruto,
      avaliadorId: match.avaliadorId,
      statusMatch: match.motivo,
      processos: g.processos,
      setores: [...g.setores],
    }
  })
  return { lotes, avisos, colunasVistas }
}

/**
 * Lê a planilha inteira (já convertida em array de linhas, com
 * `header: 1`) e devolve um grupo por número físico de caixa
 * encontrado, cada um já com o setor de cada processo e o avaliador
 * sugerido (quando reconhecido). Não toca em rede/Supabase — isso é
 * feito depois, na tela, que também consulta quais desses números de
 * caixa já existem no sistema (duplicidade), antes de qualquer envio.
 *
 * Se a planilha não tiver uma coluna "CAIXA" reconhecível em nenhuma
 * linha, devolve `null` — nesse caso a tela usa o caminho de sempre
 * (3 colunas fixas: número, ano, assunto, uma caixa só por vez), sem
 * quebrar nada do que já funciona hoje para listas simples.
 */
export function parsePlanilhaEmLotes(
  linhasBrutas: unknown[][],
  avaliadores: AvaliadorBasico[],
): LoteDetectado[] | null {
  return lerPlanilhaEmLotes(linhasBrutas, avaliadores).lotes
}
