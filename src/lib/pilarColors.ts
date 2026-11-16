// Cor de cada pilar, igual em todos os gráficos do sistema (política DINOV:
// Digitalização azul, Boas Práticas verde, Memória laranja).
import { COR } from './coresCcad'

export const PILAR_NOMES = {
  DIGITALIZACAO: 'Digitalização do Acervo',
  BOAS_PRATICAS: 'Protocolo de Boas Práticas',
  MEMORIA: 'Espaço Memória da CDTIV',
} as const

export const PILAR_COLORS: Record<string, string> = {
  [PILAR_NOMES.DIGITALIZACAO]: COR.pilarDigitalizacao,
  [PILAR_NOMES.BOAS_PRATICAS]: COR.pilarBoasPraticas,
  [PILAR_NOMES.MEMORIA]: COR.pilarMemoria,
}

export function pilarColor(nome: string | null | undefined): string {
  return (nome && PILAR_COLORS[nome]) || COR.textoDesativado
}
