import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSearch, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RelatorioMensal, Usuario } from '@/lib/database.types'
import { format, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

const STATUS_COLOR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-600',
  enviado: 'bg-green-100 text-green-700',
  atrasado: 'bg-red-100 text-red-700',
  nao_enviado: 'bg-red-50 text-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  atrasado: 'Atrasado',
  nao_enviado: 'Não enviado',
}

function gerarMeses(qtd: number) {
  return Array.from({ length: qtd }, (_, i) => format(startOfMonth(subMonths(new Date(), i)), 'yyyy-MM-dd'))
}

export function RelatoriosEquipePage() {
  const meses = useMemo(() => gerarMeses(12), [])
  const [mesSelecionado, setMesSelecionado] = useState(meses[0])

  const { data: usuarios } = useQuery({
    queryKey: ['usuarios-ativos'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('*').eq('status', 'ativo').order('nome')
      return (data ?? []) as Usuario[]
    },
  })

  const { data: relatorios, isLoading } = useQuery({
    queryKey: ['relatorios-equipe', mesSelecionado],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('*, usuario:usuario_id(id,nome,email,papel), pilar:pilar_id(id,nome)')
        .eq('mes_referencia', mesSelecionado)
      return (data ?? []) as RelatorioMensal[]
    },
    enabled: !!mesSelecionado,
  })

  const linhas = (usuarios ?? []).map(u => {
    const relatorio = (relatorios ?? []).find(r => r.usuario_id === u.id)
    return { usuario: u, relatorio }
  })

  const enviados = linhas.filter(l => l.relatorio?.status === 'enviado').length
  const total = linhas.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios da Equipe</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Acompanhe os relatórios mensais enviados por cada membro da Comissão.
          </p>
        </div>
        <select
          className="input w-56"
          value={mesSelecionado}
          onChange={e => setMesSelecionado(e.target.value)}
        >
          {meses.map(m => (
            <option key={m} value={m}>
              {format(new Date(m), 'MMMM yyyy', { locale: ptBR })}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <FileSearch size={18} className="text-teal-600 shrink-0" />
        <p className="text-sm text-gray-700">
          <strong>{enviados}</strong> de <strong>{total}</strong> membro(s) enviaram o relatório de{' '}
          {format(new Date(mesSelecionado), 'MMMM yyyy', { locale: ptBR })}.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-gray-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="text-center py-10 text-gray-400">Nenhum membro ativo cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {linhas.map(({ usuario, relatorio }) => {
            const status = relatorio?.status ?? 'nao_enviado'
            return (
              <div key={usuario.id} className="card p-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{usuario.nome}</p>
                    <p className="text-xs text-gray-400">{usuario.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {relatorio?.enviado_em && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={12} /> {format(new Date(relatorio.enviado_em), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[status])}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                </div>

                {relatorio ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Atividades realizadas
                      </p>
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {relatorio.atividades_realizadas || '—'}
                      </p>
                    </div>
                    {relatorio.dificuldades && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Dificuldades encontradas
                        </p>
                        <p className="text-gray-700 whitespace-pre-wrap">{relatorio.dificuldades}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-400">
                      Horas dedicadas no mês: {relatorio.horas_dedicadas ?? 0}h
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-400">
                    Este membro ainda não enviou o relatório deste mês.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
