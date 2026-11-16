// Tailwind do Portal da CCAD — Identidade Visual DINOV v1.0 (etapa 3).
// Todas as cores abaixo nascem dos tokens oficiais (src/lib/identidade/identidadeDinovTokens.js):
// nenhuma cor é inventada aqui. As "escalas" (50 a 900) das situações são derivadas
// misturando a cor oficial com branco ou preto; os tons 100 e 600 são os do kit.
import dinov from './src/lib/identidade/identidade-dinov.tailwind.js'
import { DV } from './src/lib/identidade/identidadeDinovTokens.js'

// mistura duas cores #RRGGBB: pct = % da cor "a"
function mix(a, b, pct) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const A = h(a), B = h(b)
  return '#' + A.map((v, i) => Math.round((v * pct + B[i] * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Escala de uma situação (texto escuro + fundo claro do kit)
function escala({ texto, fundo }) {
  return {
    50: mix(fundo, '#FFFFFF', 50),
    100: fundo,
    200: mix(fundo, texto, 85),
    300: mix(fundo, texto, 70),
    400: mix(texto, '#FFFFFF', 60),
    500: mix(texto, '#FFFFFF', 85),
    600: texto,
    700: mix(texto, '#000000', 88),
    800: mix(texto, '#000000', 72),
    900: mix(texto, '#000000', 55),
  }
}

const { base, situacao } = DV
const erro = escala(situacao.erro)
const sucesso = escala(situacao.sucesso)
const atencao = escala(situacao.atencao)
const info = escala(situacao.info)

/** @type {import('tailwindcss').Config} */
export default {
  presets: [dinov],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Azul-marinho da identidade (menu, títulos). 600 = #193651, 500 = item ativo do menu.
        navy: {
          50: base.marinhoClaro, 100: '#CFD8E1', 200: '#A9B8C6', 300: '#7F93A8', 400: '#4D6783',
          500: base.marinhoMenuAtivo, 600: base.marinho, 700: base.marinhoEscuro, 800: '#0C1C2B', 900: '#07111A',
        },
        // Cor-assinatura da CCAD (primária #0E7C86, hover #0B626B, fundo claro #E6F4F5)
        teal: {
          50: '#E6F4F5', 100: '#C0E4E7', 200: '#90CED2', 300: '#60B8BE', 400: '#30A2AA',
          500: '#0E7C86', 600: '#0B626B', 700: '#084950', 800: '#053135', 900: '#02181A',
        },
        // Laranja da CDTIV (pilar Memória): 500 só para preenchimentos e ícones; texto usa 600 (#A35700)
        accent: { ...atencao, 500: '#F68712', 600: situacao.atencao.texto },
        // Pilares (política DINOV: Digitalização azul, Boas Práticas verde, Memória laranja)
        pilar: {
          digitalizacao: DV.sistemas.ccad.acentos.pilarDigitalizacao,
          'boas-praticas': DV.sistemas.ccad.acentos.pilarBoasPraticas,
          memoria: DV.sistemas.ccad.acentos.pilarMemoria,
        },
        // Neutros do kit
        gray: {
          50: base.fundo, 100: base.divisoria, 200: base.borda, 300: '#C3CCD5', 400: base.textoDesativado,
          500: base.textoSecundario, 600: base.textoSecundario, 700: '#2F3F4E', 800: base.texto, 900: base.texto,
        },
        // Situações: o Portal já usa red/green/amber... em muitas telas; elas passam a apontar
        // para as cores de situação do kit (erro, sucesso, atenção, informação).
        red: erro,
        green: sucesso,
        amber: atencao, yellow: atencao, orange: atencao,
        blue: info, sky: info,
        // O roxo está fora da paleta: vira azul-marinho
        purple: { 50: base.marinhoClaro, 100: '#CFD8E1', 500: base.marinhoMenuAtivo, 600: base.marinho, 700: base.marinhoEscuro },
      },
      // O preset do kit troca fontSize/borderRadius. Mantemos as alturas de linha do Tailwind
      // (o preset as perderia) e escolhemos os cantos de propósito:
      // campos e botões pequenos 6px; botões e cartões 10px; modais 14px; selos em pílula.
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }], sm: ['14px', { lineHeight: '20px' }], base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }], xl: ['20px', { lineHeight: '28px' }], '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }], '4xl': ['36px', { lineHeight: '40px' }],
      },
      borderRadius: { sm: '6px', DEFAULT: '6px', md: '6px', lg: '10px', xl: '10px', '2xl': '14px', full: '9999px' },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(5px)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 400ms ease-out',
        'bounce-soft': 'bounce-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
