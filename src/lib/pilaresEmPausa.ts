// INTERRUPTOR CENTRAL DOS PILARES EM PAUSA
//
// Decisão do Coordenador (17/11/2026): os três pilares — "Digitalização do
// Acervo", "Protocolo de Boas Práticas" e "Espaço Memória da CDTIV" — ficam em
// pausa. A licitação da digitalização e o engajamento da equipe para o museu
// ainda não estão maduros, e o Boas Práticas será repensado junto com as telas
// de cada membro. O Portal passa a focar na avaliação e gestão dos documentos
// e processos.
//
// "Em pausa" quer dizer ESCONDIDO, não apagado: o código das páginas, as rotas,
// as tabelas e todos os dados no banco continuam exatamente onde estão.
//
// Para REATIVAR um pilar no futuro, basta apagar o nome dele da lista abaixo
// (uma única linha) — ele volta a aparecer em todas as telas ao mesmo tempo.
// Para PAUSAR outro, basta acrescentar o nome à lista.
import { PILAR_NOMES } from './pilarColors'

export const PILARES_EM_PAUSA: readonly string[] = [
  PILAR_NOMES.DIGITALIZACAO,
  PILAR_NOMES.BOAS_PRATICAS,
  PILAR_NOMES.MEMORIA,
]

/** true quando o pilar está em pausa (escondido das telas). */
export function pilarEmPausa(nome: string | null | undefined): boolean {
  return !!nome && PILARES_EM_PAUSA.includes(nome)
}

/** Devolve só os pilares que estão ativos (não pausados). */
export function soPilaresAtivos<T extends { nome?: string | null }>(lista: T[] | null | undefined): T[] {
  return (lista ?? []).filter(p => !pilarEmPausa(p.nome))
}

// Atalhos legíveis para as telas.
export const BOAS_PRATICAS_EM_PAUSA = pilarEmPausa(PILAR_NOMES.BOAS_PRATICAS)
/** true quando nenhum pilar está ativo: as áreas "por pilar" somem por inteiro. */
export const TODOS_PILARES_EM_PAUSA = Object.values(PILAR_NOMES).every(n => pilarEmPausa(n))
export const DIGITALIZACAO_EM_PAUSA = pilarEmPausa(PILAR_NOMES.DIGITALIZACAO)
export const MEMORIA_EM_PAUSA = pilarEmPausa(PILAR_NOMES.MEMORIA)

// A estrela "candidato ao Espaço Memória" (Acervo) e a caixinha equivalente em
// "Catalogar Processo" continuam visíveis de propósito: marcar um item
// enquanto se cataloga custa um clique e evita perder, depois, a informação de
// quais documentos mereciam ir para o museu. Mude para false para escondê-las.
export const MOSTRAR_MARCA_CANDIDATO_MEMORIA = true
