// CEPAs e CRPAs (Fase 21) — página só do Coordenador com a relação de
// todas as Confirmações de Envio (CEPA) e de Recebimento (CRPA) de
// processos para avaliação já emitidas no sistema. Serve de material de
// rastreabilidade/auditoria (ver conversa com o Sérgio em 17/09/2026) —
// os PDFs não ficam guardados em disco em lugar nenhum: são
// reimpressos na hora, a partir dos dados gravados em `cepas`/`crpas`,
// o mesmo padrão já usado nos relatórios da Equipe.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSignature, Download, Search, CheckCircle2, Clock3 } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { codigoCepa, codigoCrpa, gerarCepaPdf, gerarCrpaPdf } from '@/lib/documentosCepaCrpa'
import clsx from 'clsx'

interface CepaLista {
  id: string
  numero_sequencial: number
  ano: number
  declaracao: string
  gerado_em: string
  caixa: { numero: string; quantidade_declarada: number | null } | null
  avaliador: { nome: string } | null
  gerador: { nome: string } | null
  requisicao: { data_entrega: string } | null
  crpas:
    | { id: string; numero_sequencial: number; ano: number; declaracao: string; confirmado_em: string }[]
    | { id: string; numero_sequencial: number; ano: number; declaracao: string; confirmado_em: string }
    | null
}

function unico<T>(v: T[] | T | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function CepasCrpasPage() {
  const [busca, setBusca] = useState('')
  const [filtroAno, setFiltroAno] = useState<'todos' | number>('todos')

  const { data: cepas, isFetching } = useQuery({
    queryKey: ['cepas-crpas-lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cepas')
        .select(
          `id, numero_sequencial, ano, declaracao, gerado_em,
           caixa:caixa_id(numero, quantidade_declarada),
           avaliador:avaliador_id(nome),
           gerador:gerado_por(nome),
           requisicao:requisicao_avaliacao_id(data_entrega),
           crpas(id, numero_sequencial, ano, declaracao, confirmado_em)`,
        )
        .order('ano', { ascending: false })
        .order('numero_sequencial', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CepaLista[]
    },
  })

  const anosDisponiveis = useMemo(() => {
    const anos = new Set((cepas ?? []).map(c => c.ano))
    return [...anos].sort((a, b) => b - a)
  }, [cepas])

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (cepas ?? []).filter(c => {
      if (filtroAno !== 'todos' && c.ano !== filtroAno) return false
      if (!termo) return true
      return (
        (c.caixa?.numero ?? '').toLowerCase().includes(termo) ||
        (c.avaliador?.nome ?? '').toLowerCase().includes(termo) ||
        (c.gerador?.nome ?? '').toLowerCase().includes(termo) ||
        codigoCepa(c.numero_sequencial, c.ano).toLowerCase().includes(termo)
      )
    })
  }, [cepas, busca, filtroAno])

  function baixarCepa(c: CepaLista) {
    gerarCepaPdf({
      numeroSequencial: c.numero_sequencial,
      ano: c.ano,
      caixaNumero: c.caixa?.numero ?? '—',
      avaliadorNome: c.avaliador?.nome ?? '—',
      qtdProcessos: c.caixa?.quantidade_declarada ?? 0,
      dataEntrega: c.requisicao?.data_entrega ?? c.gerado_em.slice(0, 10),
      nomeProtocolo: c.gerador?.nome ?? '—',
      declaracao: c.declaracao,
      geradoEm: new Date(c.gerado_em),
    })
  }

  function baixarCrpa(c: CepaLista) {
    const crpa = unico(c.crpas)
    if (!crpa) return
    gerarCrpaPdf({
      numeroSequencial: crpa.numero_sequencial,
      ano: crpa.ano,
      caixaNumero: c.caixa?.numero ?? '—',
      avaliadorNome: c.avaliador?.nome ?? '—',
      qtdProcessos: c.caixa?.quantidade_declarada ?? 0,
      cepaCodigo: codigoCepa(c.numero_sequencial, c.ano),
      declaracao: crpa.declaracao,
      geradoEm: new Date(crpa.confirmado_em),
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CEPAs e CRPAs</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Confirmações de Envio (CEPA) e de Recebimento (CRPA) de processos para avaliação — rastreabilidade de
          quem enviou e quem recebeu cada caixa, com data e assinatura eletrônica de ambos.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8 text-sm"
              placeholder="Buscar por caixa, avaliador(a) ou nº do documento…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select
            className="input w-auto text-sm"
            value={filtroAno}
            onChange={e => setFiltroAno(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
          >
            <option value="todos">Todos os anos</option>
            {anosDisponiveis.map(ano => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>

        {isFetching && <p className="text-sm text-gray-400 py-4">Carregando…</p>}

        {!isFetching && listaFiltrada.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">
            {(cepas ?? []).length === 0
              ? 'Nenhuma CEPA emitida ainda. Elas aparecem aqui assim que o Protocolo enviar uma caixa e emitir o documento.'
              : 'Nenhum resultado para esse filtro.'}
          </p>
        )}

        <div className="divide-y divide-gray-100">
          {listaFiltrada.map(c => {
            const crpa = unico(c.crpas)
            return (
              <div key={c.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5">
                      {codigoCepa(c.numero_sequencial, c.ano)}
                    </span>
                    {crpa ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5">
                        <CheckCircle2 size={12} />
                        {codigoCrpa(crpa.numero_sequencial, crpa.ano)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                        <Clock3 size={12} />
                        Aguardando confirmação do(a) avaliador(a)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800">
                    Caixa <strong>{c.caixa?.numero ?? '—'}</strong> — {c.avaliador?.nome ?? '—'}
                    <span className="text-gray-400"> · {c.caixa?.quantidade_declarada ?? 0} processo(s)</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Enviada por {c.gerador?.nome ?? '—'} em {format(new Date(c.gerado_em), 'dd/MM/yyyy HH:mm')}
                    {crpa && <> · recebida em {format(new Date(crpa.confirmado_em), 'dd/MM/yyyy HH:mm')}</>}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => baixarCepa(c)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-full px-3 py-1.5"
                  >
                    <Download size={13} />
                    CEPA
                  </button>
                  <button
                    onClick={() => baixarCrpa(c)}
                    disabled={!crpa}
                    className={clsx(
                      'flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border',
                      crpa
                        ? 'text-gray-600 hover:text-gray-900 border-gray-300'
                        : 'text-gray-300 border-gray-200 cursor-not-allowed',
                    )}
                  >
                    <FileSignature size={13} />
                    CRPA
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
