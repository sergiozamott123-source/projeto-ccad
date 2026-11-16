// Geração dos PDFs de CEPA e CRPA (Fase 21) — compartilhado entre a tela
// do Protocolo (emite a CEPA em RequisicoesAvaliacaoPage.tsx), a tela do
// avaliador (emite a CRPA em AvaliacaoProcessosCard.tsx) e a tela do
// Coordenador (rebaixa/reimprime qualquer uma das duas em
// CepasCrpasPage.tsx). Ficou num arquivo só para não repetir o desenho
// do PDF em três lugares — ver migracao_fase21_cepa_crpa.sql para o
// desenho das tabelas por trás desses documentos.

import { format } from 'date-fns'
import { carregarModeloDocumento, setorCcad, dataHoraPorExtenso } from '@/lib/pdfCcad'

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

export async function gerarCepaPdf(dados: {
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
  const { JsPDF, M } = await carregarModeloDocumento()
  const codigoDocumento = codigoCepa(dados.numeroSequencial, dados.ano)
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Protocolo Geral · Arquivo'), tituloPdf: codigoDocumento },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: codigoDocumento, texto: 'Confirmação de Envio de Processos para Avaliação' })
  y = M.ficha(
    doc,
    [
      ['Caixa', dados.caixaNumero],
      ['Avaliador(a)', dados.avaliadorNome],
      ['Quantidade de processos', String(dados.qtdProcessos)],
      ['Data de entrega', format(new Date(dados.dataEntrega + 'T00:00:00'), 'dd/MM/yyyy')],
    ],
    y,
  )
  y = M.paragrafo(doc, dados.declaracao, y)
  M.assinatura(doc, {
    nome: dados.nomeProtocolo,
    cargo: 'Protocolo — CCAD/CDTIV',
    y: y + 18,
    eletronica: { data: dataHoraPorExtenso(dados.geradoEm) },
  })

  M.finalizar(doc, { codigo: codigoDocumento, geradoEm: dados.geradoEm })
  doc.save(`${codigoDocumento.replace(/[^\w-]/g, '-')}-caixa-${dados.caixaNumero}.pdf`)
}

export async function gerarCrpaPdf(dados: {
  numeroSequencial: number
  ano: number
  caixaNumero: string
  avaliadorNome: string
  qtdProcessos: number
  cepaCodigo: string
  declaracao: string
  geradoEm: Date
}) {
  const { JsPDF, M } = await carregarModeloDocumento()
  const codigoDocumento = codigoCrpa(dados.numeroSequencial, dados.ano)
  const doc = M.novoDocumento(
    { sistema: 'ccad', setor: setorCcad('Avaliação de Processos'), tituloPdf: codigoDocumento },
    JsPDF,
  )

  let y = M.titulo(doc, { chapeu: codigoDocumento, texto: 'Confirmação de Recebimento de Processos para Avaliação' })
  y = M.ficha(
    doc,
    [
      ['Caixa', dados.caixaNumero],
      ['Avaliador(a)', dados.avaliadorNome],
      ['Quantidade de processos', String(dados.qtdProcessos)],
      ['Documento de origem', dados.cepaCodigo],
    ],
    y,
  )
  y = M.paragrafo(doc, dados.declaracao, y)
  M.assinatura(doc, {
    nome: dados.avaliadorNome,
    cargo: 'Avaliador(a) — CCAD/CDTIV',
    y: y + 18,
    eletronica: { data: dataHoraPorExtenso(dados.geradoEm) },
  })

  M.finalizar(doc, { codigo: codigoDocumento, geradoEm: dados.geradoEm })
  doc.save(`${codigoDocumento.replace(/[^\w-]/g, '-')}-caixa-${dados.caixaNumero}.pdf`)
}
