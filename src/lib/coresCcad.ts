// Cores do Portal da CCAD para uso em código (gráficos, estilos inline).
// Todas vêm dos tokens oficiais da Identidade Visual DINOV (src/lib/identidade/identidadeDinovTokens.js):
// nenhuma cor é escrita à mão aqui.
import { DV } from './identidade/identidadeDinovTokens.js'

const ccad = DV.sistemas.ccad

export const COR = {
  primaria: ccad.primaria,
  primariaHover: ccad.primariaHover,
  primariaClara: ccad.primariaClara,
  marinho: DV.base.marinho,
  texto: DV.base.texto,
  textoSecundario: DV.base.textoSecundario,
  textoDesativado: DV.base.textoDesativado,
  fundo: DV.base.fundo,
  borda: DV.base.borda,
  divisoria: DV.base.divisoria,
  sucesso: DV.situacao.sucesso.texto,
  atencao: DV.situacao.atencao.texto,
  erro: DV.situacao.erro.texto,
  info: DV.situacao.info.texto,
  pilarDigitalizacao: ccad.acentos.pilarDigitalizacao,
  pilarBoasPraticas: ccad.acentos.pilarBoasPraticas,
  pilarMemoria: ccad.acentos.pilarMemoria,
  /** paleta de gráficos da CCAD, na ordem oficial */
  graficos: ccad.graficos,
} as const
