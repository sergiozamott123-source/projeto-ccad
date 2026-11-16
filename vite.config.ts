import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Identificador desta "versão" do Portal: muda a cada publicação.
// O sistema compara o identificador que está rodando no navegador com o do
// arquivo /version.json publicado — se forem diferentes, avisa o usuário.
const BUILD_ID = String(Date.now())

function arquivoDeVersao(): Plugin {
  return {
    name: 'ccad-arquivo-de-versao',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), arquivoDeVersao()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: { '@': '/src' },
  },
})
