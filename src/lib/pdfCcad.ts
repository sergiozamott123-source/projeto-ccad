// Apoio aos PDFs do Portal da CCAD: carrega o modelo único de documento da
// Identidade Visual DINOV (kit v1.0, em src/lib/identidade/) e padroniza o
// "setor" que aparece no cabeçalho. O modelo e as fontes são pesados (cerca
// de 475 KB), então só são baixados na hora em que alguém gera um PDF —
// quem não gera PDF não paga esse custo ao abrir o Portal.
import type jsPDF from 'jspdf'

const LINHA_CCAD = 'Comissão Central de Avaliação de Documentos'
const LINHA_CDTIV = 'Companhia de Desenvolvimento, Turismo e Inovação de Vitória'

/** Setor do cabeçalho: linha 1 em destaque, linhas 2 e 3 em cinza (política, seção 5.1). */
export function setorCcad(terceiraLinha: string): string[] {
  return [LINHA_CCAD, LINHA_CDTIV, terceiraLinha]
}

export async function carregarModeloDocumento() {
  const [{ default: JsPDF }, modelo, tokens] = await Promise.all([
    import('jspdf'),
    import('@/lib/identidade/identidadeDocumentoDinov'),
    import('@/lib/identidade/identidadeDinovTokens'),
  ])
  return { JsPDF, M: modelo, DV: tokens.DV, rgb: tokens.rgb }
}

/** Data e hora no padrão do modelo: "16/11/2026 às 17:30". */
export function dataHoraPorExtenso(d: Date): string {
  const data = d.toLocaleDateString('pt-BR')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${data} às ${hora}`
}

/**
 * Tabela com quebra de texto automática (para colunas dinâmicas ou textos
 * longos), nas cores do modelo: cabeçalho azul-marinho com texto branco,
 * linhas alternadas em #F6F8FA, divisórias #E3E8EE. Respeita a área útil do
 * modelo (22 mm nas laterais, 38 mm no topo, 22 mm embaixo) e repete o
 * cabeçalho em cada página. Devolve o próximo y.
 */
export async function tabelaComQuebra(
  doc: jsPDF,
  cabecalho: string[],
  linhas: string[][],
  y: number,
  opcoes: { tamanhoFonte?: number; colunasADireita?: number[] } = {},
): Promise<number> {
  const [{ default: autoTable }, { DV, rgb }, M] = await Promise.all([
    import('jspdf-autotable'),
    import('@/lib/identidade/identidadeDinovTokens'),
    import('@/lib/identidade/identidadeDocumentoDinov'),
  ])
  const direita = opcoes.colunasADireita ?? []
  const colunas: Record<number, { halign: 'right' }> = {}
  direita.forEach(i => { colunas[i] = { halign: 'right' } })
  autoTable(doc, {
    startY: y,
    head: [cabecalho],
    body: linhas,
    margin: { top: M.INICIO_CONTEUDO, bottom: 298 - M.FIM_CONTEUDO, left: M.MARGEM.esquerda, right: M.MARGEM.direita },
    styles: {
      font: 'Inter',
      fontStyle: 'normal',
      fontSize: opcoes.tamanhoFonte ?? 8.5,
      textColor: rgb(DV.base.texto),
      lineColor: rgb(DV.base.divisoria),
      lineWidth: 0.2,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: rgb(DV.base.marinho), textColor: rgb(DV.base.superficie), font: 'Inter', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: rgb(DV.base.fundo) },
    columnStyles: colunas,
  })
  const ultima = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  return (ultima?.finalY ?? y) + 8
}
