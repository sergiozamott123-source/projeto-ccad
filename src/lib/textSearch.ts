// Busca "tolerante" usada nas telas que procuram um código/assunto na
// Tabela de Temporalidade Documental (TTD) e em outras buscas de texto
// livre do sistema.
//
// Duas fontes de resultado "sumido" que a busca literal (ilike/includes
// puro) sempre vai deixar passar:
//  1) Acentuação: quem digita rápido no dia a dia frequentemente não usa
//     acento ("contratacao"), mas o assunto na TTD está gravado com
//     acento ("Contratação") — uma comparação literal não bate.
//  2) Ordem/composição das palavras: o usuário lembra de "estagiários
//     contratação" e o assunto está gravado como "Contratação de
//     Estagiários" — uma busca por substring exata (a frase inteira,
//     na mesma ordem) não bate, mesmo as duas falando da mesma coisa.
//
// normalizarTexto tira acentuação e caixa; correspondeBusca quebra o
// termo digitado em palavras e exige que TODAS apareçam em algum lugar
// do texto (em qualquer ordem) — assim "estagiario contratacao" acha
// "Contratação de Estagiários" mesmo sem acento e fora de ordem.

// eslint-disable-next-line no-misleading-character-class
const MARCAS_DIACRITICAS = /[̀-ͯ]/g

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
    .trim()
}

export function correspondeBusca(textoAlvo: string, termoBusca: string): boolean {
  const termos = normalizarTexto(termoBusca).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return true
  const alvo = normalizarTexto(textoAlvo)
  return termos.every(t => alvo.includes(t))
}
