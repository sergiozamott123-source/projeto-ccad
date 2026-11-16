// IDENTIDADE VISUAL DINOV — tokens para JavaScript/TypeScript (gráficos, jsPDF, docx, xlsx)
// Versão 1.0 · 16/11/2026 · NÃO ALTERAR no sistema: mudanças vêm do projeto de Identidade Visual.
// Uso: import { DV, corSistema, rgb } from './identidadeDinovTokens.js'
export const DV = {
  "versao": "1.0",
  "data": "2026-11-16",
  "base": {
    "marinho": "#193651",
    "marinhoEscuro": "#12283C",
    "marinhoClaro": "#E6EAEF",
    "marinhoMenuAtivo": "#244766",
    "texto": "#1F2D3A",
    "textoSecundario": "#4A5A6B",
    "textoDesativado": "#7A8796",
    "textoSuaveEscuro": "#BFD3E8",
    "fundo": "#F6F8FA",
    "superficie": "#FFFFFF",
    "borda": "#D5DCE3",
    "divisoria": "#E3E8EE"
  },
  "situacao": {
    "sucesso": {
      "texto": "#1C7A43",
      "fundo": "#E3F4EA"
    },
    "atencao": {
      "texto": "#A35700",
      "fundo": "#FEF1DE"
    },
    "erro": {
      "texto": "#B4261E",
      "fundo": "#FDE7E6"
    },
    "info": {
      "texto": "#0E5A94",
      "fundo": "#E2EEF8"
    },
    "neutro": {
      "texto": "#4A5A6B",
      "fundo": "#EEF1F5"
    }
  },
  "sistemas": {
    "facitec-conecta": {
      "nome": "FACITEC CONECTA",
      "primaria": "#3072B1",
      "primariaHover": "#255C91",
      "primariaClara": "#E8F0F8",
      "primariaTexto": "#255C91",
      "faixa": [
        "#3072B1",
        "#30B172",
        "#F3763C"
      ],
      "graficos": [
        "#3072B1",
        "#F3763C",
        "#30B172",
        "#193651",
        "#7A8796"
      ],
      "acentos": {
        "verde": "#30B172",
        "verdeClaro": "#E5F5EC",
        "laranja": "#F3763C",
        "laranjaClaro": "#FDECE3"
      },
      "logo": "facitec-conecta-assinatura",
      "rodapeTexto": "FACITEC CONECTA"
    },
    "ccad": {
      "nome": "Portal da CCAD",
      "primaria": "#0E7C86",
      "primariaHover": "#0B626B",
      "primariaClara": "#E6F4F5",
      "primariaTexto": "#0B626B",
      "faixa": [
        "#F68712",
        "#32B672",
        "#3871C1",
        "#0F5165"
      ],
      "graficos": [
        "#0E7C86",
        "#F68712",
        "#3871C1",
        "#32B672",
        "#7A8796"
      ],
      "acentos": {
        "cdtivLaranja": "#F68712",
        "cdtivVermelho": "#EF2E32",
        "cdtivVerde": "#32B672",
        "cdtivAzul": "#3871C1",
        "cdtivPetroleo": "#0F5165",
        "pilarDigitalizacao": "#3871C1",
        "pilarBoasPraticas": "#32B672",
        "pilarMemoria": "#F68712"
      },
      "logo": "ccad-assinatura",
      "rodapeTexto": "Portal da CCAD"
    },
    "dinov-gestao": {
      "nome": "DINOV-Gestão",
      "primaria": "#1170B7",
      "primariaHover": "#0E5A94",
      "primariaClara": "#E2EEF8",
      "primariaTexto": "#0E5A94",
      "faixa": [
        "#F39200",
        "#E6332A",
        "#2BA85F",
        "#1170B7",
        "#00A49A"
      ],
      "graficos": [
        "#0E5A94",
        "#F39200",
        "#2BA85F",
        "#00A49A",
        "#7A8796"
      ],
      "acentos": {
        "areaDiretora": "#F39200",
        "areaDiretoraTexto": "#A35700",
        "areaDiretoraFundo": "#FEF1DE",
        "areaGerencia": "#2BA85F",
        "areaGerenciaTexto": "#1C7A43",
        "areaGerenciaFundo": "#E3F4EA",
        "areaSecretaria": "#1170B7",
        "areaSecretariaTexto": "#0E5A94",
        "areaSecretariaFundo": "#E2EEF8",
        "areaEstagiarios": "#00A49A",
        "areaEstagiariosTexto": "#00756D",
        "areaEstagiariosFundo": "#DFF3F1"
      },
      "logo": "dinov-gestao-assinatura",
      "rodapeTexto": "DINOV-Gestão"
    }
  },
  "tipografia": {
    "fonteTitulo": "Poppins",
    "fonteTexto": "Inter",
    "telas": {
      "xs": 12,
      "sm": 14,
      "md": 16,
      "lg": 18,
      "tituloSm": 20,
      "tituloMd": 24,
      "tituloLg": 30,
      "numeroDestaque": 36
    },
    "documentos_pt": {
      "titulo": 16,
      "subtitulo": 11,
      "corpo": 11,
      "tabela": 9,
      "legenda": 8,
      "rodape": 7.5
    }
  },
  "documento": {
    "formato": "A4 retrato (210 x 297 mm)",
    "margens_mm": {
      "superior": 16,
      "inferior": 22,
      "esquerda": 22,
      "direita": 22
    },
    "faixaTopo_mm": 3,
    "logoAltura_mm": 12,
    "rodapeLogosAltura_mm": 8,
    "faixaRodape_mm": 3,
    "entrelinhaCorpo": 1.5
  }
};
/** Cores do sistema: corSistema('ccad').primaria */
export const corSistema = (sistema) => DV.sistemas[sistema];
/** '#193651' -> [25, 54, 81]  (para doc.setFillColor(...rgb(...)) no jsPDF) */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** '#193651' -> '193651' (para a biblioteca docx e para xlsx) */
export const semCerquilha = (hex) => hex.replace('#', '').toUpperCase();
