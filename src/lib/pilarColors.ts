// Brand color per pilar, kept consistent across every chart in the system.
export const PILAR_NOMES = {
  DIGITALIZACAO: 'Digitalização do Acervo',
  BOAS_PRATICAS: 'Protocolo de Boas Práticas',
  MEMORIA: 'Espaço Memória da CDTIV',
} as const

export const PILAR_COLORS: Record<string, string> = {
  [PILAR_NOMES.DIGITALIZACAO]: '#2a78d6',
  [PILAR_NOMES.BOAS_PRATICAS]: '#1baf7a',
  [PILAR_NOMES.MEMORIA]: '#eda100',
}

export function pilarColor(nome: string | null | undefined): string {
  return (nome && PILAR_COLORS[nome]) || '#6b7280'
}
