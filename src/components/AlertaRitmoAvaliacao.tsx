import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, X } from 'lucide-react'
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

  // Destaque reforçado (pedido do Sérgio, 02/10/2026) para quem está há 15
  // dias ou mais com caixa ativa e NENHUMA avaliação feita — é um caso mais
  // urgente do que simplesmente "abaixo do ritmo", então ganha um bloco
  // visualmente mais forte (vermelho) e separado, em vez de ficar misturado
  // igual aos demais atrasados (âmbar). Quem já aparece no bloco vermelho
  // não se repete no bloco âmbar logo abaixo.
  const zerados = atrasados.filter(a => a.zerado)
  const demaisAtrasados = atrasados.filter(a => !a.zerado)

  return (
    <div className="mb-3 space-y-2">
      {zerados.length > 0 && (
        <FaixaDeAlerta
          tom="vermelho"
          titulo={
            zerados.length === 1
              ? 'Atenção redobrada: 1 membro está sem nenhuma avaliação feita há mais de 15 dias'
              : `Atenção redobrada: ${zerados.length} membros estão sem nenhuma avaliação feita há mais de 15 dias`
          }
          linhas={zerados.map(a => ({
            id: a.id,
            nome: a.nome,
            texto: `recebeu processos há ${a.diasDesdeEntrega} dias e ainda não avaliou nenhum`,
          }))}
          onDispensar={dispensar}
        />
      )}

      {demaisAtrasados.length > 0 && (
        <FaixaDeAlerta
          tom="ambar"
          titulo={
            demaisAtrasados.length === 1
              ? '1 avaliador está abaixo do ritmo esperado de avaliação'
              : `${demaisAtrasados.length} avaliadores estão abaixo do ritmo esperado de avaliação`
          }
          linhas={demaisAtrasados.map(a => ({
            id: a.id,
            nome: a.nome,
            texto: `${a.percentual}% avaliado (esperado pelo menos ${a.metaEsperada}%, há ${a.diasDesdeEntrega} dias)`,
          }))}
          onDispensar={dispensar}
        />
      )}
    </div>
  )
}

const TONS = {
  vermelho: {
    caixa: 'border-red-300 bg-red-50',
    icone: 'text-red-600',
    titulo: 'text-red-900',
    texto: 'text-red-800',
    botao: 'text-red-900 hover:bg-red-100',
    fechar: 'text-red-600 hover:text-red-800',
  },
  ambar: {
    caixa: 'border-amber-300 bg-amber-50',
    icone: 'text-amber-600',
    titulo: 'text-amber-900',
    texto: 'text-amber-800',
    botao: 'text-amber-900 hover:bg-amber-100',
    fechar: 'text-amber-600 hover:text-amber-800',
  },
} as const

/**
 * Faixa compacta (pedido do Sérgio, 17/11/2026): antes a lista de nomes ocupava
 * quase um quarto da tela. Agora aparece só o título numa linha; a lista de
 * nomes abre ao clicar em "Ver lista".
 */
function FaixaDeAlerta({
  tom,
  titulo,
  linhas,
  onDispensar,
}: {
  tom: keyof typeof TONS
  titulo: string
  linhas: { id: string; nome: string; texto: string }[]
  onDispensar: () => void
}) {
  const [aberta, setAberta] = useState(false)
  const c = TONS[tom]
  return (
    <div className={`rounded-xl border px-3 py-2 ${c.caixa}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
          <AlertTriangle size={16} className={`shrink-0 ${c.icone}`} />
          <p className={`min-w-0 text-sm font-semibold ${c.titulo}`}>{titulo}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setAberta(v => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${c.botao}`}
          >
            {aberta ? 'Esconder lista' : 'Ver lista'}
            <ChevronDown size={13} className={aberta ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <Link
            to="/dashboard"
            state={{ aba: 'avaliacoes' }}
            className={`text-xs font-medium underline underline-offset-2 ${c.titulo}`}
          >
            Ver no Dashboard
          </Link>
          <button type="button" onClick={onDispensar} className={`shrink-0 ${c.fechar}`} title="Dispensar por hoje">
            <X size={16} />
          </button>
        </div>
      </div>
      {aberta && (
        <ul className="mt-2 space-y-0.5 pl-7">
          {linhas.map(l => (
            <li key={l.id} className={`text-xs ${c.texto}`}>
              <span className="font-medium">{l.nome}</span> — {l.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
