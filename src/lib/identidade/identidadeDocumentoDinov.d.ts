// Tipos para o módulo JavaScript do kit (o arquivo do kit não é alterado).
import type jsPDF from 'jspdf'

export type SistemaDinov = 'facitec-conecta' | 'ccad' | 'dinov-gestao'

export const PAGINA: { largura: number; altura: number }
export const MARGEM: { esquerda: number; direita: number; superior: number; inferior: number }
export const AREA: { x: number; largura: number }
export const INICIO_CONTEUDO: number
export const FIM_CONTEUDO: number

export function novoDocumento(
  opcoes: { sistema: SistemaDinov; setor?: string[]; tituloPdf?: string },
  JsPDF: typeof jsPDF,
): jsPDF
export function finalizar(doc: jsPDF, opcoes?: { codigo?: string; geradoEm?: Date }): jsPDF
export function titulo(doc: jsPDF, opcoes: { chapeu?: string; texto: string; y?: number; sistema?: SistemaDinov }): number
export function paragrafo(
  doc: jsPDF,
  texto: string,
  y: number,
  opcoes?: { tamanho?: number; alinhamento?: 'justify' | 'left' | 'center'; cor?: string; estilo?: string },
): number
export function ficha(doc: jsPDF, itens: Array<[string, string]>, y: number): number
export function tabela(
  doc: jsPDF,
  colunas: Array<{ titulo: string; largura: number; alinhar?: 'right' | 'left' }>,
  linhas: Array<Array<string | number>>,
  y: number,
): number
export function selo(doc: jsPDF, texto: string, tipo: 'sucesso' | 'atencao' | 'erro' | 'info' | 'neutro', x: number, y: number): number
export function assinatura(
  doc: jsPDF,
  opcoes: { nome: string; cargo: string; y: number; eletronica?: { data: string; codigo?: string } },
): number
export function localData(doc: jsPDF, y: number, data?: Date, local?: string): number
