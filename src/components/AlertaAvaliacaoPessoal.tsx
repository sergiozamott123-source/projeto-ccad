import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Info, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { buscarStatusAvaliadorAtual } from '@/lib/desempenhoAvaliadores'

// Lembrete pessoal de avaliação (pedido do Sérgio, 02/10/2026).
//
// Contexto do pedido: o Sérgio percebeu que alguns membros ficam muito
// tempo sem avaliar nenhum processo das caixas que receberam, mas não quer
// cobrar diretamente nem gerar mal-estar na equipe — prefere que a própria
// pessoa reflita e se organize sozinha. Por isso este aviso é mostrado
// dentro do próprio sistema, direto para o membro (não para o Coordenador),
// com um tom tranquilo de lembrete, nunca de cobrança.
//
// Regra: mesma definição de "zerado" usada no Alerta de Ritmo do Coordenador
// (ver DIAS_ALERTA_ZERADO em src/lib/desempenhoAvaliadores.ts) — 15 dias ou
// mais desde que recebeu a caixa mais antiga ainda ativa, e nenhum processo
// avaliado até agora.
//
// Exibição: uma vez por dia (decisão do Sérgio, 02/10/2026) — mesmo padrão
// já usado em AlertaRitmoAvaliacao.tsx, só que a chave do localStorage inclui
// o id do usuário, para o caso de mais de uma pessoa usar o mesmo navegador
// (computador compartilhado do Protocolo, por exemplo).

const CHAVE_ULTIMA_VISUALIZACAO_PREFIXO = 'ccad-alerta-avaliacao-pessoal-ultima-visualizacao-'

function hojeString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AlertaAvaliacaoPessoal() {
  const { profile } = useAuth()
  const [visivel, setVisivel] = useState(false)

  const habilitado = !!profile?.id && !!profile?.pode_avaliar_processos
  const chave = profile?.id ? `${CHAVE_ULTIMA_VISUALIZACAO_PREFIXO}${profile.id}` : null

  const { data: status } = useQuery({
    queryKey: ['alerta-avaliacao-pessoal', profile?.id],
    queryFn: () => buscarStatusAvaliadorAtual(profile!.id),
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!status?.zerado || !chave) {
      setVisivel(false)
      return
    }
    let ultimaVista: string | null = null
    try {
      ultimaVista = localStorage.getItem(chave)
    } catch {
      // localStorage indisponível (janela privada, bloqueio de site etc.) —
      // nesse caso mostramos sempre, é mais seguro do que nunca lembrar.
    }
    setVisivel(ultimaVista !== hojeString())
  }, [status, chave])

  function dispensar() {
    setVisivel(false)
    if (!chave) return
    try {
      localStorage.setItem(chave, hojeString())
    } catch {
      // sem problema não conseguir gravar — o aviso só volta a aparecer com
      // mais frequência do que o combinado, nunca menos.
    }
  }

  if (!visivel || !status?.zerado) return null

  return (
    <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 flex items-start gap-3">
      <Info size={18} className="text-sky-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sky-900">
          Notamos que você ainda não avaliou nenhum processo
        </p>
        <p className="mt-1 text-xs text-sky-800">
          Já se passaram {status.diasDesdeEntrega} dias desde que você recebeu processos para avaliar, e nenhum foi avaliado ainda. Que tal reservar um tempinho para começar? Qualquer dificuldade, é só falar com a Coordenação.
        </p>
        <Link to="/minha-parte" className="inline-block mt-2 text-xs font-medium text-sky-900 underline underline-offset-2">
          Ir para Minhas Atribuições
        </Link>
      </div>
      <button
        type="button"
        onClick={dispensar}
        className="text-sky-600 hover:text-sky-800 shrink-0"
        title="Dispensar por hoje"
      >
        <X size={16} />
      </button>
    </div>
  )
}
