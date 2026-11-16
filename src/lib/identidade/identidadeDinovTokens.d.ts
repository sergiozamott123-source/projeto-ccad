// Tipos para o módulo JavaScript do kit (o arquivo do kit não é alterado).
export interface DvSistema {
  nome: string
  primaria: string
  primariaHover: string
  primariaClara: string
  primariaTexto: string
  faixa: string[]
  graficos: string[]
  logo: string
  rodapeTexto: string
}
export const DV: {
  versao: string
  data: string
  base: {
    marinho: string
    marinhoEscuro: string
    marinhoClaro: string
    marinhoMenuAtivo: string
    texto: string
    textoSecundario: string
    textoDesativado: string
    textoSuaveEscuro: string
    fundo: string
    superficie: string
    borda: string
    divisoria: string
  }
  situacao: Record<'sucesso' | 'atencao' | 'erro' | 'info' | 'neutro', { texto: string; fundo: string }>
  sistemas: Record<'facitec-conecta' | 'ccad' | 'dinov-gestao', DvSistema>
}
export function rgb(hex: string): [number, number, number]
export function corSistema(sistema: string): DvSistema
