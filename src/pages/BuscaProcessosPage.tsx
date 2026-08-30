import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Archive, AlertTriangle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Processo, Caixa, Avaliacao } from '@/lib/database.types'

type ProcessoBusca = Processo & {
  caixa: Pick<Caixa, 'numero' | 'setor'> | null
  avaliacoes: Pick<Avaliacao, 'decisao' | 'status' | 'confirmado_em'>[] | null
}

function situacaoEliminacao(p: ProcessoBusca) {
  const confirmada = (p.avaliacoes ?? []).find(
    a => a.status === 'confirmada' && a.decisao?.toLowerCase().includes('elimin'),
  )
  return confirmada?.confirmado_em ?? null
}

export function BuscaProcessosPage() {
  const [termo, setTermo] = useState('')
  const [ano, setAno] = useState('')
  const [interessado, setInteressado] = useState('')
  const [setor, setSetor] = useState('')

  const temFiltro = termo.trim().length >= 2 || ano.trim().length > 0 || interessado.length > 0 || setor.length > 0

  const { data: setores } = useQuery({
    queryKey: ['setores-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('caixas').select('setor').not('setor', 'is', null)
      if (error) throw error
      const unicos = Array.from(new Set((data ?? []).map(c => c.setor).filter((s): s is string => !!s)))
      return unicos.sort((a, b) => a.localeCompare(b))
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: resultados, isLoading, isFetching } = useQuery({
    queryKey: ['busca-processos', termo, ano, interessado, setor],
    queryFn: async () => {
      let query = supabase
        .from('processos')
        .select('*, caixa:caixa_id!inner(numero,setor), avaliacoes(decisao,status,confirmado_em)')

      if (termo.trim().length >= 2) {
        const t = termo.trim()
        query = query.or(
          `numero_documento.ilike.%${t}%,assunto_processo.ilike.%${t}%,interessado.ilike.%${t}%,ano_producao_complemento.ilike.%${t}%`,
        )
      }
      if (ano.trim()) {
        query = query.eq('ano_producao', Number(ano.trim()))
      }
      if (interessado) {
        query = query.eq('interessado', interessado)
      }
      if (setor) {
        query = query.eq('caixa.setor', setor)
      }

      const { data, error } = await query
        .order('ano_producao', { ascending: false })
        .order('numero_documento', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data ?? []) as ProcessoBusca[]
    },
    enabled: temFiltro,
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Buscar Processo</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Encontre um processo já arquivado mesmo sem saber o número — por assunto, ano de produção ou interessado.
          O resultado sempre mostra em qual caixa do Arquivo Geral ele está guardado.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Digite um assunto, número do processo, interessado…  ex.: “energia”, “7284/2014”, “projeto curva da jurema”"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="input w-40"
            type="number"
            placeholder="Ano de produção"
            value={ano}
            onChange={e => setAno(e.target.value)}
          />
          <select className="input w-48" value={interessado} onChange={e => setInteressado(e.target.value)}>
            <option value="">Interessado — todos</option>
            <option value="CDTIV">CDTIV</option>
            <option value="PMV">PMV</option>
          </select>
          <select className="input w-48" value={setor} onChange={e => setSetor(e.target.value)}>
            <option value="">Setor de origem — todos</option>
            {(setores ?? []).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400">
          A busca considera assunto, número do documento, interessado e o campo de ano ao mesmo tempo — não precisa saber onde a informação está.
        </p>
      </div>

      {!temFiltro ? (
        <div className="card p-10 text-center">
          <Search size={36} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Digite ao menos 2 letras ou escolha um filtro para começar a busca.</p>
        </div>
      ) : isLoading || isFetching ? (
        <p className="text-center py-10 text-gray-400">Buscando…</p>
      ) : (resultados ?? []).length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-500 text-sm">Nenhum processo encontrado com esses termos. Tente um assunto mais geral ou remova algum filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            {resultados!.length} processo(s) encontrado(s){resultados!.length === 50 ? ' — mostrando os 50 primeiros, refine a busca para ver mais precisão' : ''}.
          </p>
          {resultados!.map(p => {
            const eliminadoEm = situacaoEliminacao(p)
            return (
              <div key={p.id} className="card p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-900">{p.numero_documento}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{p.interessado}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {p.ano_producao}{p.ano_producao_complemento ? ` (${p.ano_producao_complemento})` : ''}
                    </span>
                    {eliminadoEm && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium inline-flex items-center gap-1">
                        <AlertTriangle size={11} /> Eliminado em {format(new Date(eliminadoEm), 'dd/MM/yyyy')}
                      </span>
                    )}
                  </div>
                  {p.assunto_processo && (
                    <p className="text-sm text-gray-600 line-clamp-2">{p.assunto_processo}</p>
                  )}
                </div>

                <div className="shrink-0 text-center bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold flex items-center gap-1 justify-center">
                    <Archive size={11} /> Caixa
                  </p>
                  <p className="text-base font-bold text-amber-800">{p.caixa?.numero ?? '—'}</p>
                  {p.caixa?.setor && (
                    <p className="text-[10px] text-amber-600 mt-0.5">{p.caixa.setor}</p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-stretch gap-1">
                  <button
                    className="btn-secondary text-xs py-1.5 px-3 opacity-60 cursor-not-allowed"
                    disabled
                    title="Funcionalidade de Empréstimos em desenvolvimento"
                  >
                    <Clock size={12} /> Solicitar Empréstimo
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">em breve</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
