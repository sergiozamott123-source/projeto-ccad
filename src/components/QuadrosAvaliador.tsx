import { PackageCheck, PencilLine, ArrowRight, Undo2 } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { CaixaParaDevolver, CorrecaoDaCoordenacao } from '@/lib/caixasAvaliador'

/**
 * Quadro verde "Devolva ao Protocolo" — aparece quando o avaliador terminou
 * de avaliar todos os processos de uma caixa. A caixa física precisa voltar
 * ao Protocolo sem esperar a conferência da Coordenação.
 */
export function QuadroCaixasParaDevolver({
  caixas,
  onAbrir,
}: {
  caixas: CaixaParaDevolver[]
  onAbrir: (caixaNumero: string) => void
}) {
  if (caixas.length === 0) return null
  const varias = caixas.length > 1

  return (
    <div id="quadro-para-devolver" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
        <PackageCheck size={16} />
        Devolva ao Protocolo: {caixas.length} {varias ? 'caixas avaliadas' : 'caixa avaliada'}
      </h3>
      <p className="mt-0.5 text-xs text-gray-700">
        Você terminou de avaliar {varias ? 'estas caixas' : 'esta caixa'}. <strong>Entregue os processos físicos ao
        Protocolo</strong> o quanto antes, para não ficarem sob a sua guarda. O Protocolo confere em seguida e, se
        precisar ajustar algum código, corrige direto no sistema — o que mudar aparece para você aqui.
      </p>
      <p className="mt-1 text-xs text-gray-600">
        Se você já entregou, não precisa fazer mais nada no Portal: {varias ? 'a caixa sai' : 'a caixa sai'} desta
        lista quando a conferência terminar.
      </p>

      <div className="mt-3 space-y-2">
        {caixas.map(c => (
          <div
            key={c.caixaId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2"
          >
            <p className="text-sm text-gray-900">
              <span className="font-bold">Caixa {c.caixaNumero}</span>
              {' · '}
              {c.total} {c.total === 1 ? 'processo avaliado' : 'processos avaliados'}
            </p>
            <button
              type="button"
              onClick={() => onAbrir(c.caixaNumero)}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              Ver a caixa <ArrowRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Quadro azul "Corrigidos pela Coordenação" — só informa: mostra o código que
 * o avaliador usou e o código que ficou depois da conferência.
 */
export function QuadroCorrigidos({ itens }: { itens: CorrecaoDaCoordenacao[] }) {
  if (itens.length === 0) return null

  return (
    <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-sky-900">
        <PencilLine size={16} />
        Corrigidos pela Coordenação: {itens.length} {itens.length === 1 ? 'processo' : 'processos'} (últimos 30 dias)
      </h3>
      <p className="mt-1 text-xs text-gray-700">
        Na conferência, o código {itens.length === 1 ? 'deste processo foi ajustado' : 'destes processos foi ajustado'}.
        É só para você saber — não precisa fazer nada.
      </p>
      <ul className="mt-3 space-y-2">
        {itens.map(i => (
          <li key={i.avaliacaoId} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-gray-700">
            <p className="text-sm text-gray-900">
              <span className="font-mono font-semibold">Processo {i.numeroProcesso}</span>
              {i.caixaNumero && <span className="text-gray-500"> · Caixa {i.caixaNumero}</span>}
            </p>
            <p className="mt-1">
              Você usou <span className="font-mono font-semibold">{i.codigoAvaliador}</span>
              {i.assuntoAvaliador ? ` (${i.assuntoAvaliador})` : ''}
            </p>
            <p>
              Ficou <span className="font-mono font-semibold text-sky-800">{i.codigoAtual}</span>
              {i.assuntoAtual ? ` (${i.assuntoAtual})` : ''}
            </p>
            <p className="mt-0.5 text-gray-500">
              {i.corrigidoPor ? `Corrigido por ${i.corrigidoPor}` : 'Corrigido pela Coordenação'}
              {i.corrigidoEm ? ` em ${format(new Date(i.corrigidoEm), 'dd/MM')}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type AvisoAvaliador = 'devolvidos' | 'paraDevolver' | 'corrigidos'

/**
 * Faixa compacta de avisos: três botões com a contagem de cada um. O detalhe só
 * abre ao clicar (quem abre e o conteúdo ficam por conta de quem usa a faixa).
 * Assim a lista de caixas continua sendo a primeira coisa que o avaliador vê.
 */
export function FaixaAvisos({
  aberto,
  onAlternar,
  devolvidos,
  paraDevolver,
  corrigidos,
}: {
  aberto: AvisoAvaliador | null
  onAlternar: (aviso: AvisoAvaliador) => void
  devolvidos: number
  paraDevolver: number
  corrigidos: number
}) {
  const botoes: { id: AvisoAvaliador; total: number; rotulo: string; icone: React.ReactNode; cor: string; corAtiva: string }[] = [
    {
      id: 'devolvidos',
      total: devolvidos,
      rotulo: devolvidos === 1 ? 'processo devolvido para revisar' : 'processos devolvidos para revisar',
      icone: <Undo2 size={13} />,
      cor: 'border-red-300 bg-red-50 text-red-800 hover:border-red-400',
      corAtiva: 'border-red-600 bg-red-600 text-white',
    },
    {
      id: 'paraDevolver',
      total: paraDevolver,
      rotulo: paraDevolver === 1 ? 'caixa para devolver ao Protocolo' : 'caixas para devolver ao Protocolo',
      icone: <PackageCheck size={13} />,
      cor: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400',
      corAtiva: 'border-emerald-600 bg-emerald-600 text-white',
    },
    {
      id: 'corrigidos',
      total: corrigidos,
      rotulo: corrigidos === 1 ? 'corrigido pela Coordenação' : 'corrigidos pela Coordenação',
      icone: <PencilLine size={13} />,
      cor: 'border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400',
      corAtiva: 'border-sky-600 bg-sky-600 text-white',
    },
  ]
  const visiveis = botoes.filter(b => b.total > 0)
  if (visiveis.length === 0) return null

  return (
    <div id="faixa-avisos" className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Avisos</span>
      {visiveis.map(b => (
        <button
          key={b.id}
          type="button"
          aria-expanded={aberto === b.id}
          onClick={() => onAlternar(b.id)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            aberto === b.id ? b.corAtiva : b.cor,
          )}
        >
          {b.icone}
          <span className="font-bold">{b.total}</span> {b.rotulo}
        </button>
      ))}
    </div>
  )
}
