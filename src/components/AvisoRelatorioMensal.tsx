import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarClock, X } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { textoDoAviso, useAvisoRelatorio, type FasePrazo } from '@/lib/prazoRelatorio'

// Lembrete do relatório mensal (pedido do Sérgio, 17/11/2026). Duas formas:
//  - "faixa": linha compacta no alto de todas as telas (como os outros avisos do
//    Portal); nas fases cordial e reta final pode ser dispensada por hoje; depois
//    do prazo fica até a pessoa enviar;
//  - "cartao": quadro dentro da aba "Meus Relatórios Mensais", com o botão que abre
//    o relatório do mês certo.
// O aviso para sozinho de aparecer quando o relatório é enviado.

const ESTILO: Record<Exclude<FasePrazo, 'antes'>, { caixa: string; icone: string; titulo: string; corpo: string; botao: string }> = {
  cordial: {
    caixa: 'border-teal-300 bg-teal-50',
    icone: 'text-teal-600',
    titulo: 'text-teal-900',
    corpo: 'text-teal-800',
    botao: 'btn-primary',
  },
  reta_final: {
    caixa: 'border-amber-300 bg-amber-50',
    icone: 'text-amber-600',
    titulo: 'text-amber-900',
    corpo: 'text-amber-900',
    botao: 'btn-primary',
  },
  vencido: {
    caixa: 'border-rose-300 bg-rose-50',
    icone: 'text-rose-600',
    titulo: 'text-rose-900',
    corpo: 'text-rose-900',
    botao: 'btn-primary',
  },
}

function hojeString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AvisoRelatorioMensal({
  variante,
  onPreencher,
}: {
  variante: 'faixa' | 'cartao'
  /** Só no "cartao": abre o relatório do mês dentro da própria página. */
  onPreencher?: (mesRef: string) => void
}) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const aviso = useAvisoRelatorio()
  const [dispensado, setDispensado] = useState(false)
  const chave = profile?.id ? `ccad-aviso-relatorio-${profile.id}-${aviso.mesRef}` : null

  useEffect(() => {
    if (variante !== 'faixa' || !chave) return
    try {
      setDispensado(localStorage.getItem(chave) === hojeString())
    } catch {
      // sem localStorage (janela privada etc.): mostra sempre, é o lado mais seguro.
    }
  }, [variante, chave])

  if (!aviso.ativo || aviso.fase === 'antes') return null
  // A faixa não repete quando a pessoa já está na Central de Relatórios (lá aparece o cartão).
  if (variante === 'faixa' && pathname.startsWith('/central-relatorios')) return null
  const podeDispensar = variante === 'faixa' && aviso.fase !== 'vencido'
  if (variante === 'faixa' && podeDispensar && dispensado) return null

  const fase = aviso.fase
  const estilo = ESTILO[fase]
  const texto = textoDoAviso(fase, aviso)

  function preencher() {
    if (variante === 'cartao' && onPreencher) {
      onPreencher(aviso.mesRef)
      return
    }
    navigate('/central-relatorios', { state: { abaInicial: 'mensais', mes: aviso.mesRef } })
  }

  function dispensar() {
    setDispensado(true)
    if (!chave) return
    try {
      localStorage.setItem(chave, hojeString())
    } catch {
      // sem problema: o aviso só volta a aparecer mais vezes do que o combinado.
    }
  }

  return (
    <div
      role="status"
      className={clsx('mb-4 flex items-start gap-3 rounded-xl border px-4 py-3', estilo.caixa)}
      data-fase={fase}
    >
      <CalendarClock size={18} className={clsx('mt-0.5 shrink-0', estilo.icone)} />
      <div className="min-w-0 flex-1">
        <p className={clsx('text-sm font-semibold', estilo.titulo)}>{texto.titulo}</p>
        <p className={clsx('mt-1 text-xs', estilo.corpo)}>{texto.corpo}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={preencher} className={clsx(estilo.botao, 'text-xs py-1.5 px-3')}>
          {aviso.rascunho ? 'Continuar e enviar' : 'Preencher relatório'}
        </button>
        {podeDispensar && (
          <button
            type="button"
            onClick={dispensar}
            className="text-gray-400 hover:text-gray-700"
            title="Lembrar mais tarde (volta amanhã)"
            aria-label="Dispensar este aviso por hoje"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
