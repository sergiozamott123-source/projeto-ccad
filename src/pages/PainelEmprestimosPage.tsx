import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, ArrowRight, PackageCheck } from 'lucide-react'
import { format, isPast, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Processo, Caixa } from '@/lib/database.types'

type EmprestimoAtivo = {
  id: string
  solicitante_nome: string
  solicitante_matricula: string
  desarquivado_em: string
  prazo_previsto: string
  processo:
    | (Pick<Processo, 'numero_documento' | 'assunto_processo' | 'interessado' | 'setor_origem'> & {
        caixa: Pick<Caixa, 'numero' | 'setor'> | null
      })
    | null
}

export function PainelEmprestimosPage() {
  const navigate = useNavigate()

  const { data: emprestimos, isLoading } = useQuery({
    queryKey: ['painel-emprestimos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emprestimos')
        .select(
          'id,solicitante_nome,solicitante_matricula,desarquivado_em,prazo_previsto,processo:processo_id(numero_documento,assunto_processo,interessado,setor_origem,caixa:caixa_id(numero,setor))',
        )
        .is('devolvido_em', null)
        .order('prazo_previsto', { ascending: true })

      if (error) throw error
      return (data ?? []) as unknown as EmprestimoAtivo[]
    },
    refetchInterval: 5 * 60 * 1000,
  })

  const lista = emprestimos ?? []
  const atrasados = lista.filter(e => isPast(new Date(`${e.prazo_previsto}T23:59:59`)))
  const noPrazo = lista.filter(e => !isPast(new Date(`${e.prazo_previsto}T23:59:59`)))

  function irParaBusca(numeroDocumento: string) {
    navigate(`/busca-processos?termo=${encodeURIComponent(numeroDocumento)}`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel de Empréstimos</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Acompanhe de um só lugar todos os processos e documentos que estão fora do Arquivo Geral, com destaque para os
          que já passaram do prazo de devolução. Para registrar devolução ou prorrogar prazo, use o botão "Ver na Busca".
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Clock size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{lista.length}</p>
            <p className="text-sm text-gray-500">Processo(s) emprestado(s) no momento</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{atrasados.length}</p>
            <p className="text-sm text-gray-500">Com devolução em atraso</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center">
          <PackageCheck size={36} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Nenhum processo emprestado no momento — tudo arquivado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...atrasados, ...noPrazo].map(e => {
            const atrasado = isPast(new Date(`${e.prazo_previsto}T23:59:59`))
            const diasAtraso = atrasado
              ? differenceInCalendarDays(new Date(), new Date(`${e.prazo_previsto}T00:00:00`))
              : 0
            return (
              <div
                key={e.id}
                className={
                  atrasado
                    ? 'card p-4 flex items-start gap-4 border-l-4 border-l-red-400'
                    : 'card p-4 flex items-start gap-4 border-l-4 border-l-amber-300'
                }
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {e.processo?.numero_documento ?? '—'}
                    </span>
                    {e.processo?.interessado && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">
                        {e.processo.interessado}
                      </span>
                    )}
                    {e.processo?.caixa?.numero && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Caixa {e.processo.caixa.numero}
                        {(e.processo.setor_origem ?? e.processo.caixa.setor) ? ` — ${e.processo.setor_origem ?? e.processo.caixa.setor}` : ''}
                      </span>
                    )}
                    {atrasado ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium inline-flex items-center gap-1">
                        <AlertTriangle size={11} /> Atrasado há {diasAtraso} dia(s)
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium inline-flex items-center gap-1">
                        <Clock size={11} /> Devolução até {format(new Date(`${e.prazo_previsto}T00:00:00`), 'dd/MM/yyyy')}
                      </span>
                    )}
                  </div>
                  {e.processo?.assunto_processo && (
                    <p className="text-sm text-gray-600 line-clamp-1 mb-1">{e.processo.assunto_processo}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Com {e.solicitante_nome} (matrícula {e.solicitante_matricula}) — desarquivado em{' '}
                    {format(new Date(e.desarquivado_em), 'dd/MM/yyyy')}
                  </p>
                </div>

                <button
                  className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                  onClick={() => e.processo && irParaBusca(e.processo.numero_documento)}
                  disabled={!e.processo}
                >
                  Ver na Busca <ArrowRight size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
