import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { buscarFluxoCaixas, type CaixaFluxo, type EtapaFluxoCaixa } from '@/lib/fluxoCaixas'

// Fluxo das Caixas (pedido do Sérgio, 02/10/2026): ele queria enxergar com
// clareza por onde cada caixa está passando — do envio para avaliação até a
// conferência final do Protocolo — para ajudar a Ana/Ariadne a saberem, a
// qualquer momento, o que falta fazer e com quem está a bola. Um quadro em
// colunas, visível para Coordenação + quem tem pode_criar_requisicoes
// (mesmo acesso de Requisições/Conferência de Caixas), com as caixas já
// arquivadas de fora (decisão do Sérgio: só o que ainda precisa de ação).

const COLUNAS: {
  etapa: EtapaFluxoCaixa
  titulo: string
  subtitulo: string
  corBarra: string
  corBadge: string
  linkPara?: { to: string; label: string }
}[] = [
  {
    etapa: 'aguardando_cepa',
    titulo: 'Aguardando emissão da CEPA',
    subtitulo: 'Ação do Protocolo: confirmar o envio da caixa',
    corBarra: 'bg-gray-300',
    corBadge: 'bg-gray-100 text-gray-700',
    linkPara: { to: '/requisicoes-avaliacao', label: 'Ir para Requisições de Avaliação' },
  },
  {
    etapa: 'aguardando_recebimento',
    titulo: 'Aguardando confirmação de recebimento',
    subtitulo: 'Ação do avaliador: confirmar que recebeu a caixa',
    corBarra: 'bg-amber-400',
    corBadge: 'bg-amber-100 text-amber-800',
  },
  {
    etapa: 'em_avaliacao',
    titulo: 'Em avaliação',
    subtitulo: 'O avaliador está analisando os processos',
    corBarra: 'bg-sky-400',
    corBadge: 'bg-sky-100 text-sky-800',
  },
  {
    etapa: 'aguardando_conferencia',
    titulo: 'Aguardando conferência final',
    subtitulo: 'Ação do Protocolo: conferir códigos e definir o número de arquivo',
    corBarra: 'bg-teal-400',
    corBadge: 'bg-teal-100 text-teal-800',
    linkPara: { to: '/conferencia-caixas', label: 'Ir para Conferência de Caixas' },
  },
]

function textoDias(dias: number) {
  if (dias === 0) return 'desde hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

function Cartao({ caixa }: { caixa: CaixaFluxo }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
      <p className="text-sm font-semibold text-gray-900">Caixa {caixa.numero}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {caixa.setor} · {caixa.avaliador}
      </p>
      {caixa.percentualAvaliado !== null && (
        <div className="mt-1.5">
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${caixa.percentualAvaliado}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{caixa.percentualAvaliado}% avaliado</p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">{textoDias(caixa.diasNaEtapa)}</p>
    </div>
  )
}

export function FluxoCaixasPage() {
  const { data: caixas, isLoading } = useQuery({
    queryKey: ['fluxo-caixas'],
    queryFn: () => buscarFluxoCaixas(),
    staleTime: 60 * 1000,
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fluxo das Caixas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Acompanhe em tempo real por onde cada caixa está passando, do envio para avaliação até a conferência final do Protocolo.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUNAS.map(coluna => {
            const cartoes = (caixas ?? []).filter(c => c.etapa === coluna.etapa)
            return (
              <div key={coluna.etapa} className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
                <div className={`h-1 ${coluna.corBarra}`} />
                <div className="p-3 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">{coluna.titulo}</h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${coluna.corBadge}`}>{cartoes.length}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{coluna.subtitulo}</p>
                </div>
                <div className="p-3 space-y-2 flex-1 min-h-[72px]">
                  {cartoes.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">Nenhuma caixa aqui agora.</p>
                  ) : (
                    cartoes.map(c => <Cartao key={c.caixaId} caixa={c} />)
                  )}
                </div>
                {coluna.linkPara && (
                  <Link
                    to={coluna.linkPara.to}
                    className="block text-center text-xs font-medium text-teal-700 bg-teal-50 py-2 hover:bg-teal-100"
                  >
                    {coluna.linkPara.label}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
