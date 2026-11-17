// Lista "Emitir CEPA" — caixas já enviadas ao avaliador que ainda não têm a
// Confirmação de Envio de Processos para Avaliação (CEPA). Mesma regra da tela
// de Requisições de Avaliação: a lista vem sempre do banco, então não some se
// a pessoa sair da tela antes de emitir. Usa as mesmas consultas (mesmas
// chaves) da tela antiga, por isso as duas telas ficam sempre em acordo.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSignature } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { declaracaoCepa, gerarCepaPdf } from '@/lib/documentosCepaCrpa'

interface Pendente {
  requisicaoId: string
  caixaId: string
  caixaNumero: string
  avaliadorId: string
  avaliadorNome: string
  qtdProcessos: number
  dataEntrega: string
}

interface RequisicaoLinha {
  id: string
  caixa_id: string
  avaliador_id: string
  status: string
  data_entrega: string
  caixa: { numero: string; numero_fisico: string | null; quantidade_declarada: number | null } | null
  avaliador: { nome: string } | null
}

export function CepasParaEmitir({ titulo = 'Falta emitir a CEPA destas caixas' }: { titulo?: string }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [emitindo, setEmitindo] = useState<Record<string, boolean>>({})
  const [erros, setErros] = useState<Record<string, string>>({})

  const { data: requisicoes } = useQuery({
    queryKey: ['requisicoes-avaliacao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('requisicoes_avaliacao')
        .select('*, caixa:caixa_id(numero,numero_fisico,status,quantidade_declarada), avaliador:avaliador_id(nome), criador:criado_por(nome)')
        .order('created_at', { ascending: false })
      return (data ?? []) as unknown as RequisicaoLinha[]
    },
  })

  const { data: idsComCepa } = useQuery({
    queryKey: ['cepas-por-requisicao'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cepas').select('requisicao_avaliacao_id')
      if (error) throw error
      return new Set((data ?? []).map(c => c.requisicao_avaliacao_id as string))
    },
  })

  const pendentes: Pendente[] = useMemo(() => {
    if (!requisicoes || !idsComCepa) return []
    return requisicoes
      .filter(r => r.status === 'pendente' && !idsComCepa.has(r.id))
      .map(r => ({
        requisicaoId: r.id,
        caixaId: r.caixa_id,
        caixaNumero: r.caixa?.numero_fisico || r.caixa?.numero || '—',
        avaliadorId: r.avaliador_id,
        avaliadorNome: r.avaliador?.nome ?? '—',
        qtdProcessos: r.caixa?.quantidade_declarada ?? 0,
        dataEntrega: r.data_entrega,
      }))
      .reverse()
  }, [requisicoes, idsComCepa])

  const emitir = useMutation({
    mutationFn: async (item: Pendente) => {
      if (!profile) throw new Error('Sessão expirada — recarregue a página.')
      const declaracao = declaracaoCepa(item.caixaNumero, item.avaliadorNome, item.qtdProcessos, item.dataEntrega)
      const { data, error } = await supabase
        .from('cepas')
        .insert({
          requisicao_avaliacao_id: item.requisicaoId,
          caixa_id: item.caixaId,
          avaliador_id: item.avaliadorId,
          gerado_por: profile.id,
          declaracao,
        })
        .select('numero_sequencial, ano')
        .single()
      if (error) throw error
      return { item, declaracao, numeroSequencial: data!.numero_sequencial as number, ano: data!.ano as number }
    },
    onMutate: (item: Pendente) => {
      setEmitindo(p => ({ ...p, [item.requisicaoId]: true }))
      setErros(p => ({ ...p, [item.requisicaoId]: '' }))
    },
    onSuccess: async ({ item, declaracao, numeroSequencial, ano }) => {
      await gerarCepaPdf({
        numeroSequencial,
        ano,
        caixaNumero: item.caixaNumero,
        avaliadorNome: item.avaliadorNome,
        qtdProcessos: item.qtdProcessos,
        dataEntrega: item.dataEntrega,
        nomeProtocolo: profile?.nome ?? '—',
        declaracao,
        geradoEm: new Date(),
      })
      setEmitindo(p => ({ ...p, [item.requisicaoId]: false }))
      qc.setQueryData<Set<string>>(['cepas-por-requisicao'], prev => {
        const novo = new Set(prev ?? [])
        novo.add(item.requisicaoId)
        return novo
      })
      qc.invalidateQueries({ queryKey: ['cepas-por-requisicao'] })
      qc.invalidateQueries({ queryKey: ['cepas-crpas'] })
    },
    onError: (e: unknown, item: Pendente) => {
      setEmitindo(p => ({ ...p, [item.requisicaoId]: false }))
      const msg = e instanceof Error ? e.message : ''
      setErros(p => ({ ...p, [item.requisicaoId]: msg || 'Não consegui emitir a CEPA. Tente de novo.' }))
    },
  })

  if (pendentes.length === 0) return null

  return (
    <div className="card p-5 border-2 border-teal-200 bg-teal-50/40">
      <div className="flex items-start gap-3 mb-3">
        <FileSignature className="text-teal-700 mt-0.5" size={20} />
        <div>
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            A CEPA (Confirmação de Envio de Processos para Avaliação) é o documento que o avaliador precisa para confirmar
            o recebimento. Ao clicar, ela é assinada eletronicamente em seu nome e o PDF é baixado na hora. Depois, fica
            guardada em "CEPAs e CRPAs".
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {pendentes.map(item => (
          <div key={item.requisicaoId} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex-wrap">
            <div className="text-sm">
              <span className="font-semibold text-gray-900">Caixa {item.caixaNumero}</span>
              <span className="text-gray-500"> — {item.avaliadorNome} — {item.qtdProcessos} processo(s)</span>
              {erros[item.requisicaoId] && <p className="text-red-600 text-xs mt-0.5">{erros[item.requisicaoId]}</p>}
            </div>
            <button
              onClick={() => emitir.mutate(item)}
              disabled={!!emitindo[item.requisicaoId]}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-full px-3 py-1.5"
            >
              <FileSignature size={13} />
              {emitindo[item.requisicaoId] ? 'Emitindo…' : 'Emitir CEPA'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
