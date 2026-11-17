// Números dos relatórios mensais da equipe para o Superpainel.
//
// Mesma regra do lembrete (src/lib/prazoRelatorio.ts): o relatório cobrado hoje
// é o do MÊS ANTERIOR, com prazo no dia 15, e quem deve enviar são os membros e
// responsáveis de pilar com acesso ativo (a Coordenação não entra).
// O gráfico mostra os 4 últimos meses de REFERÊNCIA (terminando no mês cobrado).
// Para os meses antigos usamos a equipe de hoje como base: quem já saiu da
// equipe não entra na conta.
import { useQuery } from '@tanstack/react-query'
import { format, parse, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import type { Usuario } from '@/lib/database.types'
import { mesReferenciaDoPrazo, obrigadoARelatorio } from '@/lib/prazoRelatorio'

export interface MesDeRelatorios {
  mesRef: string
  label: string
  enviados: number
  total: number
}

export interface RelatoriosDaEquipe {
  total: number
  meses: MesDeRelatorios[]
  cobrado: MesDeRelatorios
}

export function useRelatoriosDaEquipe(hoje: Date = new Date()) {
  const mesCobrado = mesReferenciaDoPrazo(hoje)
  const base = parse(mesCobrado, 'yyyy-MM-dd', new Date())
  const mesesRef = Array.from({ length: 4 }, (_, i) => format(startOfMonth(subMonths(base, 3 - i)), 'yyyy-MM-dd'))

  return useQuery({
    queryKey: ['relatorios-equipe', mesesRef[0], mesCobrado],
    queryFn: async (): Promise<RelatoriosDaEquipe> => {
      const [{ data: us }, { data: rels }] = await Promise.all([
        supabase.from('usuarios').select('id, papel, status').eq('status', 'ativo'),
        supabase.from('relatorios_mensais').select('usuario_id, mes_referencia, status').gte('mes_referencia', mesesRef[0]),
      ])
      const obrigados = new Set(
        ((us ?? []) as Pick<Usuario, 'id' | 'papel' | 'status'>[]).filter(obrigadoARelatorio).map(u => u.id as string),
      )
      const meses = mesesRef.map(mesRef => {
        const enviados = (rels ?? []).filter(
          r => r.mes_referencia === mesRef && r.status === 'enviado' && obrigados.has(r.usuario_id as string),
        ).length
        const nome = format(parse(mesRef, 'yyyy-MM-dd', new Date()), 'MMM', { locale: ptBR })
        return { mesRef, label: nome.charAt(0).toUpperCase() + nome.slice(1), enviados, total: obrigados.size }
      })
      return { total: obrigados.size, meses, cobrado: meses[meses.length - 1] }
    },
    staleTime: 60 * 1000,
  })
}
