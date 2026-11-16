import { Undo2, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import type { CaixaComDevolvidos } from '@/lib/devolvidosAvaliador'
import { totalDevolvidos } from '@/lib/devolvidosAvaliador'

interface Props {
  grupos: CaixaComDevolvidos[]
  onCorrigir: (grupo: CaixaComDevolvidos) => void
}

/** Quadro "Devolvidos para você" — fica no topo da Avaliação de Processos. */
export function QuadroDevolvidos({ grupos, onCorrigir }: Props) {
  if (grupos.length === 0) return null
  const total = totalDevolvidos(grupos)

  return (
    <div id="quadro-devolvidos" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-red-800">
        <Undo2 size={16} />
        Devolvidos para você: {total} {total === 1 ? 'processo' : 'processos'} em {grupos.length}{' '}
        {grupos.length === 1 ? 'caixa' : 'caixas'}
      </h3>
      <p className="text-xs text-gray-700 mt-0.5">
        A Coordenação pediu que você revise a classificação {total === 1 ? 'deste processo' : 'destes processos'}.
        Clique em <strong>Corrigir agora</strong> para começar.
      </p>

      <div className="mt-3 space-y-2">
        {grupos.map(g => (
          <div
            key={g.caixaNumero}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-900">
                <span className="font-bold">Caixa {g.caixaNumero}</span>
                {' · '}
                {g.total} {g.total === 1 ? 'processo devolvido' : 'processos devolvidos'}
              </p>
              <p className="text-xs text-gray-600 truncate max-w-[60ch]" title={g.motivo ?? undefined}>
                Último motivo: {g.motivo ? `"${g.motivo}"` : 'não informado'}
              </p>
              {(g.devolvidoPor || g.devolvidoEm) && (
                <p className="text-[11px] text-gray-400">
                  {g.devolvidoPor ? `Devolvido por ${g.devolvidoPor}` : 'Devolvido'}
                  {g.devolvidoEm ? ` em ${format(new Date(g.devolvidoEm), 'dd/MM/yyyy')}` : ''}
                </p>
              )}
            </div>
            <button type="button" className="btn-primary text-xs py-1.5 px-3" onClick={() => onCorrigir(g)}>
              Corrigir agora <ArrowRight size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
