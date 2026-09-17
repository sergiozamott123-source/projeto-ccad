// Geração dos PDFs de CEPA e CRPA (Fase 21) — compartilhado entre a tela
// do Protocolo (emite a CEPA em RequisicoesAvaliacaoPage.tsx), a tela do
// avaliador (emite a CRPA em AvaliacaoProcessosCard.tsx) e a tela do
// Coordenador (rebaixa/reimprime qualquer uma das duas em
// CepasCrpasPage.tsx). Ficou num arquivo só para não repetir o desenho
// do PDF em três lugares — ver migracao_fase21_cepa_crpa.sql para o
// desenho das tabelas por trás desses documentos.

import jsPDF from 'jspdf'
import { format } from 'date-fns'
import { desenharCabecalhoCcad, desenharRodapeCcad, desenharAssinaturaCcad } from '@/lib/identidadeVisualCcad'

export function declaracaoCepa(caixaNumero: string, avaliadorNome: string, qtdProcessos: number, dataEntrega: string) {
  return `Declaro, para os devidos fins, que a Caixa ${caixaNumero} foi encaminhada para avaliação do(a) avaliador(a) ${avaliadorNome}, contendo ${qtdProcessos} processo(s), com entrega em ${format(new Date(dataEntrega + 'T00:00:00'), 'dd/MM/yyyy')}.`
}

export function declaracaoCrpa(caixaNumero: string, qtdProcessos: number, cepaCodigo: string) {
  return `Declaro, para os devidos fins, que recebi a Caixa ${caixaNumero}, contendo ${qtdProcessos} processo(s), para fins de avaliação, em atendimento à ${cepaCodigo}.`
}

export function codigoCepa(numeroSequencial: number, ano: number) {
  return `CEPA ${String(numeroSequencial).padStart(2, '0')}/${ano}`
}

export function codigoCrpa(numeroSequencial: number, ano: number) {
  return `CRPA ${String(numeroSequencial).padStart(2, '0')}/${ano}`
}

export function gerarCepaPdf(dados: {
  numeroSequencial: number
  ano: number
  caixaNumero: string
  avaliadorNome: string
  qtdProcessos: number
  dataEntrega: string
  nomeProtocolo: string
  declaracao: string
  geradoEm: Date
}) {
  const doc = new jsPDF()
  const larguraPagina = doc.internal.pageSize.getWidth()
  const margemEsquerda = 20
  const codigoDocumento = codigoCepa(dados.numeroSequencial, dados.ano)

  let y = desenharCabecalhoCcad(doc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text('CONFIRMAÇÃO DE ENVIO DE PROCESSOS PARA AVALIAÇÃO', larguraPagina / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('CCAD / CDTIV', larguraPagina / 2, y, { align: 'center' })
  y += 10

  // Selo do número do documento
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const seloLargura = doc.getTextWidth(codigoDocumento) + 10
  const seloX = larguraPagina / 2 - seloLargura / 2
  doc.setFillColor(14, 124, 134)
  doc.roundedRect(seloX, y - 5.5, seloLargura, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(codigoDocumento, larguraPagina / 2, y, { align: 'center' })
  y += 16

  // Ficha de dados
  const linhaFicha = (label: string, valor: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(90, 90, 90)
    doc.text(label, margemEsquerda, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(valor, margemEsquerda + 48, y)
    y += 7
  }
  linhaFicha('Caixa:', dados.caixaNumero)
  linhaFicha('Avaliador(a):', dados.avaliadorNome)
  linhaFicha('Quantidade de processos:', String(dados.qtdProcessos))
  linhaFicha('Data de entrega:', format(new Date(dados.dataEntrega + 'T00:00:00'), 'dd/MM/yyyy'))
  y += 8

  y = desenharAssinaturaCcad(doc, y, {
    nome: dados.nomeProtocolo,
    papel: 'Protocolo — CCAD/CDTIV',
    declaracao: dados.declaracao,
    dataHora: dados.geradoEm,
  })

  desenharRodapeCcad(doc, codigoDocumento)
  doc.save(`${codigoDocumento.replace(/[^\w-]/g, '-')}-caixa-${dados.caixaNumero}.pdf`)
}

export function gerarCrpaPdf(dados: {
  numeroSequencial: number
  ano: number
  caixaNumero: string
  avaliadorNome: string
  qtdProcessos: number
  cepaCodigo: string
  declaracao: string
  geradoEm: Date
}) {
  const doc = new jsPDF()
  const larguraPagina = doc.internal.pageSize.getWidth()
  const margemEsquerda = 20
  const codigoDocumento = codigoCrpa(dados.numeroSequencial, dados.ano)

  let y = desenharCabecalhoCcad(doc)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  const linhasTitulo = doc.splitTextToSize('CONFIRMAÇÃO DE RECEBIMENTO DE PROCESSOS PARA AVALIAÇÃO', larguraPagina - 50)
  doc.text(linhasTitulo, larguraPagina / 2, y, { align: 'center' })
  y += 6 * linhasTitulo.length
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('CCAD / CDTIV', larguraPagina / 2, y, { align: 'center' })
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const seloLargura = doc.getTextWidth(codigoDocumento) + 10
  const seloX = larguraPagina / 2 - seloLargura / 2
  doc.setFillColor(14, 124, 134)
  doc.roundedRect(seloX, y - 5.5, seloLargura, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(codigoDocumento, larguraPagina / 2, y, { align: 'center' })
  y += 16

  const linhaFicha = (label: string, valor: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(90, 90, 90)
    doc.text(label, margemEsquerda, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    doc.text(valor, margemEsquerda + 55, y)
    y += 7
  }
  linhaFicha('Caixa:', dados.caixaNumero)
  linhaFicha('Avaliador(a):', dados.avaliadorNome)
  linhaFicha('Quantidade de processos:', String(dados.qtdProcessos))
  linhaFicha('Documento de origem:', dados.cepaCodigo)
  y += 8

  y = desenharAssinaturaCcad(doc, y, {
    nome: dados.avaliadorNome,
    papel: 'Avaliador(a) — CCAD/CDTIV',
    declaracao: dados.declaracao,
    dataHora: dados.geradoEm,
  })

  desenharRodapeCcad(doc, codigoDocumento)
  doc.save(`${codigoDocumento.replace(/[^\w-]/g, '-')}-caixa-${dados.caixaNumero}.pdf`)
}
