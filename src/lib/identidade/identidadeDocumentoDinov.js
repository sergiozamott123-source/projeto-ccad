// =====================================================================
// IDENTIDADE VISUAL DINOV — MODELO ÚNICO DE DOCUMENTO A4 PARA jsPDF
// Versão 1.0 · 16/11/2026 · Guardião: projeto "Identidade Visual - FACITEC_CONECTA"
// ---------------------------------------------------------------------
// Vale para TODOS os PDFs do FACITEC CONECTA, do Portal da CCAD e do DINOV-Gestão
// (declarações, termos, relatórios, fichas, CEPA/CRPA, FSPB etc.).
// Copie para o sistema os 4 arquivos juntos, na mesma pasta (ex.: src/lib/identidade/):
//   identidadeDocumentoDinov.js · identidadeDinovTokens.js · logosDinov.js · fontesDinov.js
// NÃO ALTERE estes arquivos no sistema. Ajustes são decididos no projeto de Identidade Visual.
//
// USO MÍNIMO
//   import { jsPDF } from 'jspdf';
//   import { novoDocumento, titulo, paragrafo, assinatura, finalizar } from './identidadeDocumentoDinov.js';
//   const doc = novoDocumento({ sistema: 'facitec-conecta', setor: ['Secretaria Executiva', 'FACITEC · CMCT'] }, jsPDF);
//   let y = titulo(doc, { chapeu: 'Edital FACITEC nº 01/2026', texto: 'Declaração de Regularidade' });
//   y = paragrafo(doc, 'Declaramos, para os devidos fins, que ...', y);
//   y = assinatura(doc, { nome: 'Sérgio Paulo Tomaz', cargo: 'Secretário Executivo do CMCT/FACITEC', y: y + 20 });
//   finalizar(doc);            // desenha rodapé e numeração em todas as páginas
//   doc.save('declaracao.pdf');
// =====================================================================
import { DV, rgb } from './identidadeDinovTokens.js';
import { LOGOS } from './logosDinov.js';
import { FONTES } from './fontesDinov.js';

// ---------- Medidas do modelo (mm) ----------
export const PAGINA = { largura: 210, altura: 297 };
export const MARGEM = { esquerda: 22, direita: 22, superior: 16, inferior: 22 };
export const AREA = { x: MARGEM.esquerda, largura: 210 - MARGEM.esquerda - MARGEM.direita }; // 166 mm
export const INICIO_CONTEUDO = 38;   // y onde começa o conteúdo, abaixo do cabeçalho
export const FIM_CONTEUDO = 266;     // y máximo do conteúdo, acima do rodapé
const COR = DV.base;

// ---------- Fontes ----------
const REGISTRO = [
  ['Poppins-Regular.ttf', 'Poppins', 'normal'],
  ['Poppins-Medium.ttf', 'PoppinsMedium', 'normal'],
  ['Poppins-Bold.ttf', 'Poppins', 'bold'],
  ['Inter-Regular.ttf', 'Inter', 'normal'],
  ['Inter-Italic.ttf', 'Inter', 'italic'],
  ['Inter-SemiBold.ttf', 'InterSemiBold', 'normal'],
  ['Inter-Bold.ttf', 'Inter', 'bold'],
];
/** Registra Poppins e Inter no documento (chamado por novoDocumento). */
export function registrarFontes(doc) {
  REGISTRO.forEach(([arquivo, familia, estilo]) => {
    doc.addFileToVFS(arquivo, FONTES[arquivo]);
    doc.addFont(arquivo, familia, estilo);
  });
}
/** Estilos de texto do modelo: 'titulo' | 'tituloMedio' | 'texto' | 'textoItalico' | 'textoSemi' | 'textoNegrito' */
export function fonte(doc, estilo, tamanhoPt, corHex = COR.texto) {
  const mapa = {
    titulo: ['Poppins', 'bold'], tituloMedio: ['PoppinsMedium', 'normal'], tituloRegular: ['Poppins', 'normal'],
    texto: ['Inter', 'normal'], textoItalico: ['Inter', 'italic'], textoSemi: ['InterSemiBold', 'normal'], textoNegrito: ['Inter', 'bold'],
  };
  const [familia, est] = mapa[estilo] || mapa.texto;
  doc.setFont(familia, est);
  doc.setFontSize(tamanhoPt);
  doc.setTextColor(...rgb(corHex));
}

// ---------- Faixas coloridas ----------
function faixa(doc, cores, x, y, largura, altura) {
  const w = largura / cores.length;
  cores.forEach((c, i) => { doc.setFillColor(...rgb(c)); doc.rect(x + i * w, y, w + 0.05, altura, 'F'); });
}

// ---------- Cabeçalho ----------
/**
 * Cabeçalho padrão: faixa na cor-assinatura + logo do sistema à esquerda + setor à direita + linha fina.
 * @param {object} o  { sistema: 'facitec-conecta'|'ccad'|'dinov-gestao', setor: ['LINHA 1 (destaque)', 'linha 2', 'linha 3'] }
 */
export function cabecalho(doc, { sistema, setor = [] }) {
  const s = DV.sistemas[sistema];
  faixa(doc, s.faixa, 0, 0, PAGINA.largura, 3);
  const logo = LOGOS[s.logo];
  const altura = sistema === 'ccad' ? 14 : 12;
  doc.addImage(logo.dataUrl, 'PNG', MARGEM.esquerda, 10, altura * logo.proporcao, altura, undefined, 'FAST');
  const xd = PAGINA.largura - MARGEM.direita;
  if (setor[0]) { fonte(doc, 'titulo', 8.5, COR.marinho); doc.text(setor[0].toUpperCase(), xd, 14.5, { align: 'right', charSpace: 0.3 }); }
  fonte(doc, 'texto', 7.5, COR.textoSecundario);
  setor.slice(1, 3).forEach((l, i) => doc.text(l, xd, 18.6 + i * 3.6, { align: 'right' }));
  doc.setDrawColor(...rgb(COR.borda)); doc.setLineWidth(0.3);
  doc.line(MARGEM.esquerda, 28, xd, 28);
}

// ---------- Rodapé ----------
/** Rodapé padrão: linha + logos CDTIV e Prefeitura + "Gerado pelo <sistema> em ..." + página x de y + faixa. */
export function rodape(doc, { sistema, pagina, total, codigo, geradoEm = new Date() }) {
  const s = DV.sistemas[sistema];
  const xd = PAGINA.largura - MARGEM.direita;
  doc.setDrawColor(...rgb(COR.divisoria)); doc.setLineWidth(0.3);
  doc.line(MARGEM.esquerda, 276, xd, 276);
  const cd = LOGOS['cdtiv-logo'], pm = LOGOS['prefeitura-vitoria-horizontal'];
  doc.addImage(cd.dataUrl, 'PNG', MARGEM.esquerda, 279, 8 * cd.proporcao, 8, undefined, 'FAST');
  doc.addImage(pm.dataUrl, 'PNG', MARGEM.esquerda + 8 * cd.proporcao + 6, 279, 8 * pm.proporcao, 8, undefined, 'FAST');
  const data = geradoEm.toLocaleDateString('pt-BR');
  const hora = geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  fonte(doc, 'texto', 7, COR.textoSecundario);
  doc.text(`Gerado pelo ${s.rodapeTexto} em ${data} às ${hora}${codigo ? ` · Código ${codigo}` : ''}`, xd, 282, { align: 'right' });
  fonte(doc, 'textoSemi', 7.5, COR.marinho);
  doc.text(`Página ${pagina} de ${total}`, xd, 286.2, { align: 'right' });
  faixa(doc, [...s.faixa, COR.marinho, COR.marinho], 0, 294, PAGINA.largura, 3);
}

// ---------- Blocos de conteúdo ----------
/** Título do documento, com chapéu opcional (linha pequena acima). Devolve o próximo y. */
export function titulo(doc, { chapeu, texto, y = INICIO_CONTEUDO, sistema }) {
  const s = DV.sistemas[sistema || doc.__dvSistema];
  let yy = y;
  if (chapeu) {
    doc.setFillColor(...rgb(s.faixa[s.faixa.length > 3 ? 0 : 2]));
    doc.rect(MARGEM.esquerda, yy - 2.6, 5, 2.6, 'F');
    fonte(doc, 'textoSemi', 8.5, s.primariaTexto);
    doc.text(chapeu.toUpperCase(), MARGEM.esquerda + 7.5, yy, { charSpace: 0.35 });
    yy += 8.5;
  }
  fonte(doc, 'titulo', 16, COR.marinho);
  const linhas = doc.splitTextToSize(texto, AREA.largura);
  doc.text(linhas, MARGEM.esquerda, yy, { lineHeightFactor: 1.2 });
  yy += linhas.length * 16 * 0.3528 * 1.2 + 2;
  faixa(doc, s.faixa.slice(0, 3), MARGEM.esquerda, yy, 30, 1.2);
  return yy + 10;
}

/** Parágrafo justificado (Inter 11pt, entrelinha 1,5). Quebra de página automática. Devolve o próximo y. */
export function paragrafo(doc, texto, y, { tamanho = 11, alinhamento = 'justify', cor = COR.texto, estilo = 'texto' } = {}) {
  fonte(doc, estilo, tamanho, cor);
  const alturaLinha = tamanho * 0.3528 * 1.5;
  const linhas = doc.splitTextToSize(texto, AREA.largura);
  let yy = y;
  linhas.forEach((linha, i) => {
    if (yy > FIM_CONTEUDO) { doc.addPage(); yy = INICIO_CONTEUDO; fonte(doc, estilo, tamanho, cor); }
    const ultima = i === linhas.length - 1;
    if (alinhamento === 'justify' && !ultima) doc.text(linha, MARGEM.esquerda, yy, { maxWidth: AREA.largura, align: 'justify' });
    else doc.text(linha, alinhamento === 'center' ? PAGINA.largura / 2 : MARGEM.esquerda, yy, { align: alinhamento === 'center' ? 'center' : 'left' });
    yy += alturaLinha;
  });
  return yy + alturaLinha * 0.5;
}

/** Quadro-resumo (ficha) em 2 colunas: [['RÓTULO', 'valor'], ...]. Devolve o próximo y. */
export function ficha(doc, itens, y) {
  const col = AREA.largura / 2, linhas = Math.ceil(itens.length / 2), alt = 11.5;
  const h = linhas * alt + 5;
  doc.setFillColor(...rgb(COR.marinhoClaro)); doc.rect(MARGEM.esquerda, y, AREA.largura, h, 'F');
  doc.setFillColor(...rgb(COR.marinho)); doc.rect(MARGEM.esquerda, y, 1.6, h, 'F');
  itens.forEach(([rotulo, valor], i) => {
    const x = MARGEM.esquerda + 6 + (i % 2) * col, yy = y + 7 + Math.floor(i / 2) * alt;
    fonte(doc, 'textoSemi', 6.8, COR.textoSecundario); doc.text(rotulo.toUpperCase(), x, yy, { charSpace: 0.3 });
    fonte(doc, 'textoSemi', 9, COR.texto); doc.text(doc.splitTextToSize(String(valor), col - 10)[0], x, yy + 4.6);
  });
  return y + h + 9;
}

/** Tabela simples com cabeçalho azul-marinho. colunas: [{titulo, largura (mm), alinhar?}], linhas: [[...]] */
export function tabela(doc, colunas, linhas, y) {
  const hCab = 8, hLin = 7;
  let yy = y;
  const desenharCab = () => {
    doc.setFillColor(...rgb(COR.marinho)); doc.rect(MARGEM.esquerda, yy, AREA.largura, hCab, 'F');
    fonte(doc, 'textoSemi', 8, '#FFFFFF');
    let x = MARGEM.esquerda;
    colunas.forEach((c) => { doc.text(c.titulo, c.alinhar === 'right' ? x + c.largura - 2.5 : x + 2.5, yy + 5.3, { align: c.alinhar === 'right' ? 'right' : 'left' }); x += c.largura; });
    yy += hCab;
  };
  desenharCab();
  linhas.forEach((l, i) => {
    if (yy + hLin > FIM_CONTEUDO) { doc.addPage(); yy = INICIO_CONTEUDO; desenharCab(); }
    if (i % 2 === 1) { doc.setFillColor(...rgb(COR.fundo)); doc.rect(MARGEM.esquerda, yy, AREA.largura, hLin, 'F'); }
    fonte(doc, 'texto', 8.5, COR.texto);
    let x = MARGEM.esquerda;
    l.forEach((v, j) => { const c = colunas[j]; doc.text(String(v), c.alinhar === 'right' ? x + c.largura - 2.5 : x + 2.5, yy + 4.7, { align: c.alinhar === 'right' ? 'right' : 'left' }); x += c.largura; });
    doc.setDrawColor(...rgb(COR.divisoria)); doc.setLineWidth(0.2); doc.line(MARGEM.esquerda, yy + hLin, MARGEM.esquerda + AREA.largura, yy + hLin);
    yy += hLin;
  });
  return yy + 8;
}

/** Selo de situação (pílula). tipo: 'sucesso'|'atencao'|'erro'|'info'|'neutro'. Devolve a largura usada. */
export function selo(doc, texto, tipo, x, y) {
  const c = DV.situacao[tipo];
  fonte(doc, 'textoSemi', 8, c.texto);
  const w = doc.getTextWidth(texto) + 6;
  doc.setFillColor(...rgb(c.fundo)); doc.roundedRect(x, y - 3.6, w, 5.2, 2.6, 2.6, 'F');
  doc.text(texto, x + 3, y);
  return w;
}

/** Bloco de assinatura (manual e/ou eletrônica), centralizado. Devolve o próximo y. */
export function assinatura(doc, { nome, cargo, y, eletronica }) {
  let yy = y;
  if (yy + (eletronica ? 26 : 16) > FIM_CONTEUDO) { doc.addPage(); yy = INICIO_CONTEUDO + 20; }
  const cx = PAGINA.largura / 2;
  doc.setDrawColor(...rgb(COR.marinho)); doc.setLineWidth(0.4);
  doc.line(cx - 40, yy, cx + 40, yy);
  fonte(doc, 'titulo', 10.5, COR.marinho); doc.text(nome, cx, yy + 5.5, { align: 'center' });
  fonte(doc, 'texto', 9, COR.textoSecundario); doc.text(cargo, cx, yy + 10, { align: 'center' });
  yy += 14;
  if (eletronica) {
    fonte(doc, 'textoItalico', 7.5, COR.textoSecundario);
    const t = `Documento assinado eletronicamente por ${nome} em ${eletronica.data}${eletronica.codigo ? ` · Código de verificação: ${eletronica.codigo}` : ''}.`;
    doc.text(doc.splitTextToSize(t, 120), cx, yy + 1, { align: 'center' });
    yy += 8;
  }
  return yy + 6;
}

/** Linha de local e data: "Vitória, 10 de novembro de 2026." Devolve o próximo y. */
export function localData(doc, y, data = new Date(), local = 'Vitória') {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  fonte(doc, 'texto', 11, COR.texto);
  doc.text(`${local}, ${data.getDate()} de ${meses[data.getMonth()]} de ${data.getFullYear()}.`, MARGEM.esquerda, y);
  return y + 10;
}

// ---------- Ciclo do documento ----------
/**
 * Cria o documento A4 já com fontes, cabeçalho em todas as páginas novas e metadados.
 * @param {object} o  { sistema, setor, tituloPdf }
 * @param {class}  JsPDF  a classe jsPDF importada pelo sistema
 */
export function novoDocumento({ sistema, setor = [], tituloPdf = '' }, JsPDF) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  registrarFontes(doc);
  doc.__dvSistema = sistema;
  doc.__dvSetor = setor;
  doc.setProperties({ title: tituloPdf, author: DV.sistemas[sistema].nome, creator: `${DV.sistemas[sistema].nome} · Identidade Visual DINOV ${DV.versao}` });
  doc.setLanguage && doc.setLanguage('pt-BR');
  cabecalho(doc, { sistema, setor });
  const addPageOriginal = doc.addPage.bind(doc);
  doc.addPage = (...args) => { addPageOriginal(...args); cabecalho(doc, { sistema, setor }); return doc; };
  return doc;
}

/** Desenha o rodapé com "Página x de y" em todas as páginas. Chame antes de salvar. */
export function finalizar(doc, { codigo, geradoEm } = {}) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    rodape(doc, { sistema: doc.__dvSistema, pagina: p, total, codigo, geradoEm });
  }
  return doc;
}
