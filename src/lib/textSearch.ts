// Busca "tolerante" usada nas telas que procuram um código/assunto na
// Tabela de Temporalidade Documental (TTD) e em outras buscas de texto
// livre do sistema.
//
// Três fontes de resultado "sumido" que uma busca literal (ilike/includes
// puro) sempre vai deixar passar:
//  1) Acentuação: quem digita rápido no dia a dia frequentemente não usa
//     acento ("contratacao"), mas o assunto na TTD está gravado com
//     acento ("Contratação") — uma comparação literal não bate.
//  2) Ordem/composição das palavras: o usuário lembra de "estagiários
//     contratação" e o assunto está gravado como "Contratação de
//     Estagiários" — uma busca por substring exata (a frase inteira,
//     na mesma ordem) não bate, mesmo as duas falando da mesma coisa.
//  3) Plural, gênero e pequenas variações no final da palavra: o usuário
//     digita "estagiários" (plural) mas o assunto está gravado como
//     "Estagiário" (singular) — ou vice-versa. Uma busca por substring
//     comum falha aqui porque nenhuma das duas palavras "cabe dentro"
//     da outra sempre na mesma direção.
//
// normalizarTexto tira acentuação e caixa. correspondeBusca quebra o
// termo digitado em palavras, quebra o texto onde procurar em palavras
// também, e considera que uma palavra digitada "encontrou" o texto
// quando ela é prefixo de alguma palavra do texto OU o contrário —
// assim "estagiario", "estagiários", "estagiária" e "estagiárias" todos
// se encontram entre si, em qualquer ordem dentro da frase.

// eslint-disable-next-line no-misleading-character-class
const MARCAS_DIACRITICAS = /[̀-ͯ]/g

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
    .trim()
}

// Quebra um texto normalizado em palavras (letras e números), ignorando
// pontuação, hífen, barra etc.
function palavrasDe(textoNormalizado: string): string[] {
  return textoNormalizado.split(/[^a-z0-9]+/).filter(Boolean)
}

// Duas palavras "correspondem" quando uma é prefixo da outra — cobre a
// imensa maioria dos casos de plural/singular e masculino/feminino em
// português ("estagiario" ~ "estagiarios" ~ "estagiaria" ~
// "estagiarias") e também busca parcial de uma palavra só ("contrat"
// acha "contratação"). Só exigimos igualdade exata quando alguma das
// palavras é muito curta (menos de 3 letras), para não gerar
// coincidências bobas tipo "de" batendo em qualquer palavra que comece
// com "de".
function palavrasCorrespondem(termo: string, palavraDoTexto: string): boolean {
  if (termo.length < 3 || palavraDoTexto.length < 3) return termo === palavraDoTexto
  return palavraDoTexto.startsWith(termo) || termo.startsWith(palavraDoTexto)
}

export function correspondeBusca(textoAlvo: string, termoBusca: string): boolean {
  const termos = palavrasDe(normalizarTexto(termoBusca))
  if (termos.length === 0) return true
  const palavrasAlvo = palavrasDe(normalizarTexto(textoAlvo))
  return termos.every(termo => palavrasAlvo.some(p => palavrasCorrespondem(termo, p)))
}
