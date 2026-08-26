import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, X, Plus, ClipboardPaste } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { RequisicaoAvaliacao } from '@/lib/database.types'
import clsx from 'clsx'

type RequisicaoLista = RequisicaoAvaliacao & {
  caixa: { numero: string } | null
  avaliador: { nome: string } | null
  criador: { nome: string } | null
}

interface LinhaProcesso {
  numero: string
  ano: string
  assunto: string
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

// Aceita colar direto da planilha (colunas separadas por tab) ou
// digitado à mão (separado por espaço): número do processo, ano
// (pode vir com letra junto, ex. "1993A") e o assunto que está na
// etiqueta do processo. Os três são obrigatórios — sem o assunto o
// avaliador não tem como saber qual código da TTD usar.
function parseLinhasColadas(texto: string): LinhaProcesso[] {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const partes = l.includes('\t') ? l.split('\t') : l.split(/\s+/)
      const [numero, ano, ...resto] = partes
      return { numero: (numero ?? '').trim(), ano: (ano ?? '').trim(), assunto: resto.join(' ').trim() }
    })
    .filter(l => l.numero)
}

export function RequisicoesAvaliacaoPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [caixaNumero, setCaixaNumero] = useState('')
  const [dataEntrega, setDataEntrega] = useState(hoje())
  const [avaliadorId, setAvaliadorId] = useState('')
  const [textoColado, setTextoColado] = useState('')
  const [linhas, setLinhas] = useState<LinhaProcesso[]>([])
  const [erro, setErro] = useState('')

  const caixaNumeroBusca = caixaNumero.trim()

  const { data: caixaExistente } = useQuery({
    queryKey: ['caixa-existente', caixaNumeroBusca],
    queryFn: async () => {
      const { data: caixa } = await supabase.from('caixas').select('id, numero').eq('numero', caixaNumeroBusca).maybeSingle()
      if (!caixa) return null
      const { count } = await supabase.from('processos').select('*', { count: 'exact', head: true }).eq('caixa_id', caixa.id)
      return { ...caixa, totalProcessos: count ?? 0 }
    },
    enabled: caixaNumeroBusca.length > 0,
  })

  const { data: avaliadores } = useQuery({
    queryKey: ['avaliadores-habilitados'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('id, nome, email').eq('pode_avaliar_processos', true).order('nome')
      return data ?? []
    },
  })

  const { data: requisicoes, isLoading } = useQuery({
    queryKey: ['requisicoes-avaliacao'],
    queryFn: async () => {
      const { data } = await supabase
        .from('requisicoes_avaliacao')
        .select('*, caixa:caixa_id(numero), avaliador:avaliador_id(nome), criador:criado_por(nome)')
        .order('created_at', { ascending: false })
      return (data ?? []) as RequisicaoLista[]
    },
  })

  function processarColado() {
    const novas = parseLinhasColadas(textoColado)
    if (novas.length === 0) return
    setLinhas(prev => [...prev, ...novas])
    setTextoColado('')
  }

  function atualizarLinha(i: number, campo: keyof LinhaProcesso, valor: string) {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  function removerLinha(i: number) {
    setLinhas(prev => prev.filter((_, idx) => idx !== i))
  }

  // Uma linha só entra na requisição se tiver os três campos: sem
  // isso o avaliador chega numa tela sem informação para classificar.
  const linhasPreenchidas = linhas.filter(l => l.numero.trim())
  const linhasValidas = linhasPreenchidas.filter(l => l.ano.trim() && l.assunto.trim())
  const linhasIncompletas = linhasPreenchidas.filter(l => !l.ano.trim() || !l.assunto.trim())

  const enviar = useMutation({
    mutationFn: async () => {
      if (!caixaNumeroBusca || !avaliadorId || !profile || linhasValidas.length === 0 || linhasIncompletas.length > 0) return

      let caixaId = caixaExistente?.id
      if (!caixaId) {
        const { data: novaCaixa, error: eCaixa } = await supabase
          .from('caixas')
          .insert({ numero: caixaNumeroBusca })
          .select('id')
          .single()
        if (eCaixa) throw eCaixa
        caixaId = novaCaixa!.id
      }

      for (const l of linhasValidas) {
        const numero = l.numero.trim()
        const { data: existente } = await supabase
          .from('processos')
          .select('id')
          .eq('caixa_id', caixaId)
          .eq('numero_documento', numero)
          .maybeSingle()
        if (existente) continue

        const anoMatch = l.ano.trim().match(/^(\d{4})(.*)$/)
        const { error: eProc } = await supabase.from('processos').insert({
          caixa_id: caixaId,
          numero_documento: numero,
          ano_producao: anoMatch ? Number(anoMatch[1]) : null,
          ano_producao_complemento: anoMatch && anoMatch[2].trim() ? anoMatch[2].trim() : null,
          assunto_processo: l.assunto.trim(),
        })
        if (eProc) throw eProc
      }

      const { error: eReq } = await supabase.from('requisicoes_avaliacao').insert({
        caixa_id: caixaId,
        avaliador_id: avaliadorId,
        criado_por: profile.id,
        data_entrega: dataEntrega,
      })
      if (eReq) throw eReq
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisicoes-avaliacao'] })
      qc.invalidateQueries({ queryKey: ['caixa-existente'] })
      setCaixaNumero('')
      setAvaliadorId('')
      setLinhas([])
      setTextoColado('')
      setDataEntrega(hoje())
      setErro('')
    },
    onError: (e: any) => {
      setErro(
        e?.message?.includes('duplicate') || e?.code === '23505'
          ? 'Essa caixa já foi enviada para esse avaliador e ainda está pendente.'
          : e?.message || 'Erro ao enviar a requisição. Tente novamente.',
      )
    },
  })

  const statusLabel: Record<string, { label: string; style: string }> = {
    pendente: { label: 'Pendente', style: 'bg-amber-100 text-amber-700' },
    concluida: { label: 'Concluída', style: 'bg-teal-100 text-teal-700' },
    cancelada: { label: 'Cancelada', style: 'bg-gray-100 text-gray-500' },
  }

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('requisicoes_avaliacao').update({ status: 'cancelada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requisicoes-avaliacao'] }),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Requisições de Avaliação</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Cadastre os processos de uma caixa que acabou de chegar e envie para um avaliador habilitado.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Nova requisição</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Nº da caixa</label>
            <input className="input" placeholder="Número da caixa…" value={caixaNumero} onChange={e => setCaixaNumero(e.target.value)} />
          </div>
          <div>
            <label className="label">Data da entrega</label>
            <input type="date" className="input" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
          </div>
          <div>
            <label className="label">Avaliador</label>
            <select className="input" value={avaliadorId} onChange={e => setAvaliadorId(e.target.value)}>
              <option value="">Selecione…</option>
              {(avaliadores ?? []).map(a => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {caixaNumeroBusca && (
          <p className="text-xs text-gray-500 mt-2">
            {caixaExistente
              ? `Caixa ${caixaExistente.numero} já existe, com ${caixaExistente.totalProcessos} processo(s) catalogado(s). Os processos abaixo serão adicionados a ela, sem duplicar os que já existem.`
              : `Caixa ${caixaNumeroBusca} ainda não existe — será criada agora.`}
          </p>
        )}

        {(avaliadores ?? []).length === 0 && (
          <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mt-3">
            Nenhum avaliador habilitado ainda. Fale com a Coordenação para liberar alguém como avaliador.
          </p>
        )}

        <div className="mt-5 pt-4 border-t border-gray-100">
          <label className="label">Processos da caixa</label>
          <p className="text-xs text-gray-400 mb-2">
            Cole aqui a lista de processos — um por linha, igual na planilha: número do processo, ano de produção e o assunto que está na etiqueta do processo. Os três são obrigatórios: sem o assunto, quem for avaliar não vai saber do que se trata.
          </p>
          <div className="flex gap-2">
            <textarea
              className="input min-h-[80px] resize-y font-mono text-xs"
              placeholder={'1309\t1993\tPRORROGAÇÃO DE CONVÊNIO COM A TEC VITÓRIA\n1254\t1993A\tCI Nº 220 - PAGAMENTO DE FATURA'}
              value={textoColado}
              onChange={e => setTextoColado(e.target.value)}
            />
          </div>
          <button className="btn-secondary text-xs mt-2" onClick={processarColado} disabled={!textoColado.trim()}>
            <ClipboardPaste size={13} /> Adicionar à lista
          </button>

          {linhas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="font-medium pb-1 pr-2">Nº Processo *</th>
                    <th className="font-medium pb-1 pr-2">Ano *</th>
                    <th className="font-medium pb-1 pr-2">Assunto (da etiqueta) *</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const incompleta = l.numero.trim() && (!l.ano.trim() || !l.assunto.trim())
                    return (
                      <tr key={i} className={clsx('border-t', incompleta ? 'border-red-100 bg-red-50/50' : 'border-gray-100')}>
                        <td className="py-1 pr-2">
                          <input className="input py-1 text-xs" value={l.numero} onChange={e => atualizarLinha(i, 'numero', e.target.value)} />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className={clsx('input py-1 text-xs w-24', l.numero.trim() && !l.ano.trim() && 'border-red-300')}
                            value={l.ano}
                            onChange={e => atualizarLinha(i, 'ano', e.target.value)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className={clsx('input py-1 text-xs', l.numero.trim() && !l.assunto.trim() && 'border-red-300')}
                            placeholder="Assunto obrigatório…"
                            value={l.assunto}
                            onChange={e => atualizarLinha(i, 'assunto', e.target.value)}
                          />
                        </td>
                        <td className="py-1">
                          <button onClick={() => removerLinha(i)} className="text-gray-400 hover:text-red-600">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {linhasIncompletas.length > 0 && (
            <p className="text-xs text-red-600 mt-2">
              {linhasIncompletas.length} processo{linhasIncompletas.length === 1 ? '' : 's'} com o ano ou o assunto em branco (destacado{linhasIncompletas.length === 1 ? '' : 's'} acima). Preencha ou remova antes de enviar.
            </p>
          )}

          <button
            className="btn-secondary text-xs mt-3"
            onClick={() => setLinhas(prev => [...prev, { numero: '', ano: '', assunto: '' }])}
          >
            <Plus size={13} /> Adicionar linha em branco
          </button>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            className="btn-primary text-sm"
            disabled={!caixaNumeroBusca || !avaliadorId || linhasValidas.length === 0 || linhasIncompletas.length > 0 || enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            <Send size={14} /> {enviar.isPending ? 'Enviando…' : `Enviar requisição (${linhasValidas.length} processo${linhasValidas.length === 1 ? '' : 's'})`}
          </button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
      </div>

      <div className="card p-2 sm:p-4">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : (requisicoes ?? []).length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">Nenhuma requisição criada ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(requisicoes ?? []).map(r => (
              <div key={r.id} className="py-3 px-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono font-semibold text-gray-900 text-sm">Caixa {r.caixa?.numero ?? '—'}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', statusLabel[r.status]?.style)}>
                      {statusLabel[r.status]?.label ?? r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Para {r.avaliador?.nome ?? '—'} · enviado por {r.criador?.nome ?? '—'} · entregue em {format(new Date(r.data_entrega + 'T00:00:00'), 'dd/MM/yyyy')}
                  </p>
                </div>
                {r.status === 'pendente' && (
                  <button
                    className="btn-secondary text-xs py-1.5 px-3"
                    disabled={cancelar.isPending}
                    onClick={() => cancelar.mutate(r.id)}
                  >
                    <X size={13} /> Cancelar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
