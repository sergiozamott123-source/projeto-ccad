// Avisos do próprio sistema, mostrados no alto das telas:
// 1) "Nova versão disponível" — quando publicamos uma atualização, quem está com o
//    Portal aberto recebe o aviso e atualiza com um clique (sem precisar saber de Ctrl+Shift+R).
// 2) "Instalar como aplicativo" — oferece o ícone do CCAD na área de trabalho / tela inicial,
//    com janela própria. Só aparece onde o navegador permite instalar e se ainda não estiver instalado.
import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'

const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000 // confere a cada 5 minutos
const ADIAR_ATUALIZACAO_MS = 30 * 60 * 1000 // "Depois" esconde o aviso por 30 minutos
const CHAVE_INSTALAR = 'ccad-instalar-dispensado'
const ADIAR_INSTALACAO_MS = 30 * 24 * 60 * 60 * 1000 // "Agora não" esconde por 30 dias

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function jaEstaInstalado(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function instalacaoFoiDispensada(): boolean {
  try {
    const t = Number(localStorage.getItem(CHAVE_INSTALAR) ?? 0)
    return Date.now() - t < ADIAR_INSTALACAO_MS
  } catch {
    return false
  }
}

function useNovaVersao() {
  const [temNova, setTemNova] = useState(false)
  const [adiadoAte, setAdiadoAte] = useState(0)

  const verificar = useCallback(async () => {
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const { id } = (await r.json()) as { id?: string }
      if (id && id !== __BUILD_ID__) setTemNova(true)
    } catch {
      /* sem internet ou arquivo indisponível: tenta de novo mais tarde */
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return // em desenvolvimento não há versão publicada
    const t0 = window.setTimeout(verificar, 20_000)
    const t = window.setInterval(verificar, INTERVALO_VERIFICACAO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearTimeout(t0); window.clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [verificar])

  return {
    visivel: temNova && Date.now() >= adiadoAte,
    adiar: () => setAdiadoAte(Date.now() + ADIAR_ATUALIZACAO_MS),
  }
}

function useInstalacao() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null)
  const [dispensado, setDispensado] = useState(instalacaoFoiDispensada)

  useEffect(() => {
    if (jaEstaInstalado()) return
    const aoOferecer = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalacao) }
    const aoInstalar = () => setEvento(null)
    window.addEventListener('beforeinstallprompt', aoOferecer)
    window.addEventListener('appinstalled', aoInstalar)
    return () => { window.removeEventListener('beforeinstallprompt', aoOferecer); window.removeEventListener('appinstalled', aoInstalar) }
  }, [])

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
  }
  function dispensar() {
    try { localStorage.setItem(CHAVE_INSTALAR, String(Date.now())) } catch { /* sem armazenamento: só some nesta sessão */ }
    setDispensado(true)
  }

  return { visivel: !!evento && !dispensado, instalar, dispensar }
}

export function AvisosDoSistema() {
  const versao = useNovaVersao()
  const instalacao = useInstalacao()

  if (!versao.visivel && !instalacao.visivel) return null

  return (
    <div className="space-y-3 mb-4">
      {versao.visivel && (
        <div role="status" className="flex items-start gap-3 rounded-lg border p-3 text-sm" style={{ background: 'var(--dv-info-fundo)', borderColor: 'var(--dv-info)', color: 'var(--dv-info)' }}>
          <RefreshCw size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Há uma versão nova do Portal da CCAD</p>
            <p>
              Atualize para receber as melhorias mais recentes. Se estiver preenchendo alguma coisa, conclua e salve
              antes de atualizar.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Atualizar agora
            </button>
            <button type="button" className="btn-secondary" onClick={versao.adiar}>
              Depois
            </button>
          </div>
        </div>
      )}

      {instalacao.visivel && (
        <div role="status" className="flex items-start gap-3 rounded-lg border p-3 text-sm bg-white" style={{ borderColor: 'var(--dv-borda)' }}>
          <img src="/ccad-icone.svg" alt="" className="w-10 h-10 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Instale o Portal da CCAD como aplicativo</p>
            <p className="text-gray-600">
              O ícone dos livros fica na sua área de trabalho (ou tela inicial) e o Portal abre em janela própria,
              sem a barra do navegador.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className="btn-primary" onClick={instalacao.instalar}>
              <Download size={16} /> Instalar
            </button>
            <button type="button" className="btn-secondary" onClick={instalacao.dispensar}>
              Agora não
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
