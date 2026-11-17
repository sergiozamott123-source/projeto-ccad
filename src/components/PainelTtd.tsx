import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { correspondeBusca } from '@/lib/textSearch'
import type { TtdCodigo } from '@/lib/database.types'
import { DecisaoBadge } from '@/components/badges/DecisaoBadges'
import clsx from 'clsx'

/**
 * Painel de consulta à Tabela de Temporalidade (TTD), só para LER — fica ao
 * lado da lista de avaliações a conferir (perfil "conferência", Ariadne e
 * Júlia) ou abre por cima da tela, num quadro lateral.
 *
 * A busca é controlada por quem usa o painel (`busca` / `onBusca`): assim o
 * botão "Ver na TTD" de cada processo consegue escrever o código dele aqui e
 * a pessoa já vê o código usado pelo avaliador, sem digitar nada.
 */
export function PainelTtd({
  busca,
  onBusca,
  codigoEmDestaque,
  onFechar,
}: {
  busca: string
  onBusca: (valor: string) => void
  /** Código usado pelo avaliador no processo em análise (ganha destaque). */
  codigoEmDestaque?: string | null
  /** Se informado, mostra um botão X (uso como quadro por cima da tela). */
  onFechar?: () => void
}) {
  const [classe, setClasse] = useState<'todas' | '01' | '02'>('todas')

  const { data: todos, isLoading } = useQuery({
    queryKey: ['ttd-codigos-picker'], // mesma consulta do seletor de código: carrega uma vez só
    queryFn: async () => {
      const { data } = await supabase
        .from('ttd_codigos')
        .select('*')
        .eq('status', 'vigente')
        .order('classe', { ascending: true })
        .order('codigo', { ascending: true })
      return (data ?? []) as TtdCodigo[]
    },
    staleTime: 1000 * 60 * 10,
  })

  const termo = busca.trim()
  const filtrados = useMemo(() => {
    return (todos ?? []).filter(t => {
      const okClasse = classe === 'todas' || (t.classe ?? '').startsWith(classe)
      const okBusca = !termo || correspondeBusca(`${t.codigo} ${t.serie} ${t.assunto}`, termo)
      return okClasse && okBusca
    })
  }, [todos, termo, classe])

  const LIMITE = 40
  const visiveis = filtrados.slice(0, LIMITE)

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Tabela de Temporalidade (TTD)</h2>
          <p className="mt-0.5 text-xs text-gray-500">Consulte aqui para conferir o código usado.</p>
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="shrink-0 text-gray-400 hover:text-gray-700"
            aria-label="Fechar a Tabela TTD"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="space-y-2 border-b border-gray-100 px-4 py-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 pr-8 text-sm"
            placeholder="Digite o código ou o assunto…"
            value={busca}
            onChange={e => onBusca(e.target.value)}
            aria-label="Buscar na Tabela TTD"
          />
          {busca && (
            <button
              type="button"
              onClick={() => onBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label="Limpar a busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {([
            ['todas', 'Todas'],
            ['01', '01 · Atividade-meio'],
            ['02', '02 · Atividade-fim'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setClasse(valor)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                classe === valor
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Carregando a tabela…</p>
        ) : filtrados.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-gray-500">
            Nenhum código encontrado{termo ? <> para "{termo}"</> : ''}. Tente outra palavra ou só o número do código.
          </p>
        ) : (
          <>
            <p className="px-2 pb-1.5 text-xs text-gray-500">
              {filtrados.length} código{filtrados.length === 1 ? '' : 's'}
              {filtrados.length > LIMITE && <> · mostrando os {LIMITE} primeiros — digite mais letras para afinar</>}
            </p>
            <ul className="space-y-1.5">
              {visiveis.map(t => {
                const destaque = !!codigoEmDestaque && t.codigo === codigoEmDestaque
                return (
                  <li
                    key={t.id}
                    className={clsx(
                      'rounded-lg border px-3 py-2 text-xs',
                      destaque ? 'border-teal-400 bg-teal-50' : 'border-gray-100 bg-white',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-teal-700">{t.codigo}</span>
                      <DecisaoBadge destino={t.destinacao_final} />
                      {destaque && <span className="font-medium text-teal-700">· código usado pelo avaliador</span>}
                    </div>
                    <p className="mt-1 text-gray-800">{t.assunto}</p>
                    <p className="mt-0.5 text-gray-500">
                      {[t.classe, t.serie].filter(Boolean).join(' / ')}
                    </p>
                    {(t.fase_corrente || t.fase_intermediaria) && (
                      <p className="mt-0.5 text-gray-500">
                        Corrente: {t.fase_corrente || '—'} · Intermediária: {t.fase_intermediaria || '—'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
