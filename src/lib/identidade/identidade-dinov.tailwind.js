// IDENTIDADE VISUAL DINOV — preset do Tailwind (Portal da CCAD e FACITEC CONECTA)
// Versão 1.0. Uso no tailwind.config.js:
//   import dinov from './identidade-dinov.tailwind.js'   (ou require)
//   export default { presets: [dinov], ... }
// As cores apontam para as variáveis CSS de identidade-dinov.css (importe o CSS também).
export default {
  theme: {
    extend: {
      colors: {
        marinho: { DEFAULT: 'var(--dv-marinho)', escuro: 'var(--dv-marinho-escuro)', claro: 'var(--dv-marinho-claro)' },
        primaria: { DEFAULT: 'var(--dv-primaria)', hover: 'var(--dv-primaria-hover)', clara: 'var(--dv-primaria-clara)', texto: 'var(--dv-primaria-texto)' },
        texto: { DEFAULT: 'var(--dv-texto)', secundario: 'var(--dv-texto-secundario)', desativado: 'var(--dv-texto-desativado)' },
        fundo: 'var(--dv-fundo)', superficie: 'var(--dv-superficie)', borda: 'var(--dv-borda)', divisoria: 'var(--dv-divisoria)',
        sucesso: { DEFAULT: 'var(--dv-sucesso)', fundo: 'var(--dv-sucesso-fundo)' },
        atencao: { DEFAULT: 'var(--dv-atencao)', fundo: 'var(--dv-atencao-fundo)' },
        erro:    { DEFAULT: 'var(--dv-erro)',    fundo: 'var(--dv-erro-fundo)' },
        info:    { DEFAULT: 'var(--dv-info)',    fundo: 'var(--dv-info-fundo)' },
        neutro:  { DEFAULT: 'var(--dv-neutro)',  fundo: 'var(--dv-neutro-fundo)' },
      },
      fontFamily: {
        titulo: ['Poppins', 'Segoe UI', 'Arial', 'sans-serif'],
        sans:   ['Inter', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      fontSize: { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px', '3xl': '30px', '4xl': '36px' },
      borderRadius: { sm: '6px', DEFAULT: '10px', md: '10px', lg: '14px', full: '9999px' },
    },
  },
};
