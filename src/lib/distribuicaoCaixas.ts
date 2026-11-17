// Apoio da tela "Distribuição de caixas" (Protocolo): transforma o que a
// leitura da planilha encontrou em frases simples, e sugere o avaliador
// certo quando o nome na planilha veio com um errinho de digitação.
//
// Nada aqui fala com o banco; é só texto e comparação de nomes.
import {
  normalizarTexto,
  type AvaliadorBasico,
  type AvisoPlanilha,
} from './parsePlanilhaEmLotes'

/** Avisos em que uma linha da planilha NÃO foi lida (por isso exigem ciência antes de enviar). */
export function avisoIgnoraLinha(a: AvisoPlanilha): boolean {
  return a.tipo === 'linha_sem_caixa' || a.tipo === 'linha_sem_processo'
}

function linhaTexto(a: AvisoPlanilha): string {
  return a.linhaExcel ? `Linha ${a.linhaExcel}` : 'Uma linha'
}

/** Frase simples para cada aviso da leitura. */
export function textoDoAviso(a: AvisoPlanilha): string {
  switch (a.tipo) {
    case 'sem_cabecalho':
      return 'Não encontrei a linha de títulos com as colunas CAIXA e PROCESSO.'
    case 'sem_coluna_caixa':
      return `Na linha ${a.linhaExcel ?? ''} dos títulos não encontrei a coluna CAIXA.`.replace('  ', ' ')
    case 'sem_coluna_processo':
      return `Na linha ${a.linhaExcel ?? ''} dos títulos não encontrei a coluna PROCESSO.`.replace('  ', ' ')
    case 'linha_sem_caixa':
      return `${linhaTexto(a)} (processo ${a.processo}) está sem o número da caixa e não foi lida.`
    case 'linha_sem_processo':
      return a.caixa
        ? `${linhaTexto(a)} (caixa ${a.caixa}) está sem o número do processo e não foi lida.`
        : `${linhaTexto(a)}${a.detalhe ? ` ("${a.detalhe}")` : ''} está sem caixa e sem número de processo e não foi lida.`
    case 'caixa_em_blocos_separados':
      return `A caixa ${a.caixa} aparece em dois trechos da planilha (o segundo começa na linha ${a.linhaExcel}). Somei tudo numa caixa só. Confira se é isso mesmo.`
    case 'processo_repetido_na_caixa':
      return `O processo ${a.processo} aparece mais de uma vez na caixa ${a.caixa} (linha ${a.linhaExcel}).`
    case 'processo_em_mais_de_uma_caixa':
      return `O processo ${a.processo} aparece nas caixas ${a.detalhe} e ${a.caixa} (linha ${a.linhaExcel}).`
    default:
      return 'Algo na planilha pede conferência.'
  }
}

function distancia(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let anterior = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const atual = [i]
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo)
    }
    anterior = atual
  }
  return anterior[n]
}

/**
 * Quando o nome da planilha não bate com nenhum avaliador (ex.: "Jenifer"),
 * sugere o avaliador cujo nome é parecido (no máximo 2 letras de diferença).
 * Só sugere quando há exatamente UM candidato — nunca adivinha entre dois.
 * É só uma sugestão: a pessoa precisa clicar para aceitar.
 */
export function sugerirAvaliador(nomeNaPlanilha: string, avaliadores: AvaliadorBasico[]): AvaliadorBasico | null {
  const palavras = normalizarTexto(nomeNaPlanilha).split(' ').filter(p => p.length >= 4)
  if (palavras.length === 0) return null
  const candidatos = avaliadores.filter(av => {
    const nomePalavras = normalizarTexto(av.nome).split(' ').filter(Boolean)
    return palavras.every(p => nomePalavras.some(np => distancia(p, np) <= 2))
  })
  return candidatos.length === 1 ? candidatos[0] : null
}
