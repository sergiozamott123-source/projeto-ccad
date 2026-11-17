import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, ClipboardCopy } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import type { Usuario } from '@/lib/database.types'
import {
  faseDoPrazo,
  mensagemDeCobranca,
  mesPorExtenso,
  mesReferenciaDoPrazo,
  obrigadoARelatorio,
  prazoCurto,
} from '@/lib/prazoRelatorio'

// Quadro da Coordenação (aba "Relatórios da Equipe"): quem ainda não enviou o
// relatório do mês anterior, com o prazo (dia 15) em destaque e uma mensagem
// pronta para copiar. Não depende do mês escolhido na página.
const COR_POR_FASE = {
  antes: 'border-gray-200 bg-white',
  cordial: 'border-teal-300 bg-teal-50',
  reta_final: 'border-amber-300 bg-amber-50',
  vencido: 'border-rose-300 bg-rose-50',
} as const

export function QuadroQuemFalta() {
  const hoje = new Date()
  const fase = faseDoPrazo(hoje)
  const mesRef = mesReferenciaDoPrazo(hoje)
  const mesExtenso = mesPorExtenso(mesRef)
  const prazo = prazoCurto(hoje)
  const [copiado, setCopiado] = useState(false)

  const { data } = useQuery({
    queryKey: ['quem-falta-relatorio', mesRef],
    queryFn: async () => {
      const [{ data: us }, { data: rels }] = await Promise.all([
        supabase.from('usuarios').select('id, nome, papel, status').eq('status', 'ativo').order('nome'),
        supabase.from('relatorios_mensais').select('usuario_id, status').eq('mes_referencia', mesRef),
      ])
      const obrigados = ((us ?? []) as Pick<Usuario, 'id' | 'nome' | 'papel' | 'status'>[]).filter(obrigadoARelatorio)
      const statusDe = new Map((rels ?? []).map(r => [r.usuario_id as string, r.status as string]))
      const faltam = obrigados
        .filter(u => statusDe.get(u.id) !== 'enviado')
        .map(u => ({ id: u.id, nome: u.nome, rascunho: statusDe.get(u.id) === 'rascunho' }))
      return { total: obrigados.length, faltam }
    },
    staleTime: 60 * 1000,
  })

  if (!data) return null

  const todosEnviaram = data.faltam.length === 0

  async function copiar() {
    const texto = mensagemDeCobranca({ nomes: data!.faltam.map(f => f.nome), mesExtenso, fase, prazo })
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      window.prompt('Copie a mensagem abaixo (Ctrl+C):', texto)
    }
  }

  return (
    <div className={clsx('rounded-xl border p-4', todosEnviaram ? 'border-green-300 bg-green-50' : COR_POR_FASE[fase])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {todosEnviaram ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <CalendarClock size={18} className="mt-0.5 shrink-0 text-gray-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {todosEnviaram
                ? `Todos os ${data.total} membros já enviaram o relatório de ${mesExtenso}.`
                : `Faltam ${data.faltam.length} de ${data.total} relatórios de ${mesExtenso} (prazo: dia ${prazo}).`}
            </p>
            {!todosEnviaram && (
            <p className="mt-0.5 text-xs text-gray-600">
              {fase === 'antes'
                ? 'Os avisos aos membros começam no dia 10.'
                : fase === 'vencido'
                  ? 'O prazo passou: os membros que faltam já veem um aviso mais firme no Portal.'
                  : 'Os membros que faltam já recebem o lembrete no Portal.'}
            </p>
            )}
          </div>
        </div>
        {!todosEnviaram && (
          <button type="button" onClick={copiar} className="btn-secondary text-xs py-1.5 px-3">
            <ClipboardCopy size={13} /> {copiado ? 'Mensagem copiada' : 'Copiar mensagem de cobrança'}
          </button>
        )}
      </div>
      {!todosEnviaram && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.faltam.map(f => (
            <span
              key={f.id}
              className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800"
              title={f.rascunho ? 'Já começou o relatório (rascunho), mas ainda não enviou' : 'Ainda não começou'}
            >
              {f.nome}
              {f.rascunho && <span className="ml-1 text-gray-500">· rascunho</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
