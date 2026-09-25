import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { buscarAvaliadoresAtrasados } from '@/lib/desempenhoAvaliadores'

// Alerta de Ritmo de Avaliação (claude/plano-alerta-ritmo-avaliacoes.md).
// Pedido do Sérgio: perceber rápido quando um avaliador está muito atrasado
// nas caixas que recebeu, sem precisar lembrar de ir conferir manualmente.
//
// Regra (definida pelo Sérgio, 23/09/2026): pelo menos 20% do que está sob
// responsabilidade de um avaliador precisa estar avaliado a cada 7 dias
// corridos — ver `calcularRitmo` em src/lib/desempenhoAvaliadores.ts.
//
// Exibição (decisão do Sérgio, item 2 do plano): uma vez por dia, na
// primeira tela que ele abrir. Guardamos no navegador a última data em que
// ele já viu o alerta — sem tabela nova, sem afetar outros dispositivos.

const CHAVE_ULTIMA_VISUALIZACAO = 'ccad-alerta-ritmo-ultima-visualizacao'

function hojeString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AlertaRitmoAvaliacao() {
  const { isCoord } = useAuth()
  const [visivel, setVisivel] = useState(false)

  const { data: atrasados } = useQuery({
    queryKey: ['alerta-ritmo-avaliacao'],
    queryFn: () => buscarAvaliadoresAtrasados(),
    enabled: isCoord,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!isCoord || !atrasados || atrasados.length === 0) {
      setVisivel(false)
      return
    }
    let ultimaVista: string | null = null
    try {
      ultimaVista = localStorage.getItem(CHAVE_ULTIMA_VISUALIZACAO)
    } catch {
      // localStorage indisponível (janela privada, bloqueio de site etc.) —
      // nesse caso mostramos sempre, é mais seguro do que nunca alertar.
    }
    setVisivel(ultimaVista !== hojeString())
  }, [isCoord, atrasados])

  function dispensar() {
    setVisivel(false)
    try {
      localStorage.setItem(CHAVE_ULTIMA_VISUALIZACAO, hojeString())
    } catch {
      // sem problema não conseguir gravar — o alerta só volta a aparecer
      // com mais frequência do que o combinado, nunca menos.
    }
  }

  if (!isCoord || !visivel || !atrasados || atrasados.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          {atrasados.length === 1
            ? '1 avaliador está abaixo do ritmo esperado de avaliação'
            : `${atrasados.length} avaliadores estão abaixo do ritmo esperado de avaliação`}
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {atrasados.map(a => (
            <li key={a.id} className="text-xs text-amber-800">
              <span className="font-medium">{a.nome}</span> — {a.percentual}% avaliado (esperado pelo menos {a.metaEsperada}%, há {a.diasDesdeEntrega} dias)
            </li>
          ))}
        </ul>
        <Link to="/dashboard" state={{ aba: 'avaliacoes' }} className="inline-block mt-2 text-xs font-medium text-amber-900 underline underline-offset-2">
          Ver detalhes no Dashboard
        </Link>
      </div>
      <button
        type="button"
        onClick={dispensar}
        className="text-amber-600 hover:text-amber-800 shrink-0"
        title="Dispensar por hoje"
      >
        <X size={16} />
      </button>
    </div>
  )
}
