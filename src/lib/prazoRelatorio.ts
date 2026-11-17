// Lembrete do Relatório Mensal (pedido do Sérgio, 17/11/2026).
//
// Regra combinada: cada membro envia, pelo Portal, o relatório do MÊS ANTERIOR
// até o dia 15 do mês seguinte (o mesmo "mês anterior" que a rotina
// marcar-relatorios-atrasados já usa). Os avisos começam no dia 10 e mudam de
// tom em 3 fases:
//   dias 10 a 12 → lembrete cordial
//   dias 13 a 15 → reta final
//   dia 16 em diante → prazo vencido (mensagem mais firme, sempre respeitosa)
// O aviso some sozinho quando a pessoa envia o relatório.
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parse, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Usuario } from '@/lib/database.types'

export const DIA_PRAZO = 15
export const DIA_INICIO_AVISOS = 10
/** Último dia da fase "cordial" (dias 10, 11 e 12). */
const ULTIMO_DIA_CORDIAL = 12

export type FasePrazo = 'antes' | 'cordial' | 'reta_final' | 'vencido'

export function faseDoPrazo(hoje: Date): FasePrazo {
  const dia = hoje.getDate()
  if (dia < DIA_INICIO_AVISOS) return 'antes'
  if (dia <= ULTIMO_DIA_CORDIAL) return 'cordial'
  if (dia <= DIA_PRAZO) return 'reta_final'
  return 'vencido'
}

/** Mês a que o relatório pendente se refere: sempre o mês anterior ('yyyy-MM-01'). */
export function mesReferenciaDoPrazo(hoje: Date): string {
  return format(startOfMonth(subMonths(hoje, 1)), 'yyyy-MM-dd')
}

/** Nome do mês por extenso ('outubro de 2026'), sem depender do fuso horário. */
export function mesPorExtenso(mesRef: string): string {
  return format(parse(mesRef, 'yyyy-MM-dd', new Date()), "MMMM 'de' yyyy", { locale: ptBR })
}

/** Dias que faltam até o prazo (0 = hoje é o último dia; negativo = já passou). */
export function diasParaOPrazo(hoje: Date): number {
  const prazo = new Date(hoje.getFullYear(), hoje.getMonth(), DIA_PRAZO)
  return differenceInCalendarDays(prazo, hoje)
}

/** Dia do prazo para mostrar nos textos ('15'). */
export function prazoCurto(_hoje?: Date): string {
  return String(DIA_PRAZO)
}

/** Quem tem o dever de enviar o relatório mensal: membros ativos (a Coordenação não entra). */
export function obrigadoARelatorio(u: Pick<Usuario, 'papel' | 'status'> | null | undefined): boolean {
  return !!u && u.status === 'ativo' && (u.papel === 'membro' || u.papel === 'responsavel_pilar')
}

export interface TextoAviso {
  titulo: string
  corpo: string
}

function quandoVence(dias: number, mesExtenso: string): string {
  if (dias <= 0) return `Hoje é o último dia para enviar o relatório de ${mesExtenso}`
  if (dias === 1) return `Amanhã vence o prazo do relatório de ${mesExtenso}`
  return `Faltam ${dias} dias para o prazo do relatório de ${mesExtenso}`
}

/** Textos do aviso para cada fase. Tom: cordial no início, mais firme (e sempre respeitoso) depois do prazo. */
export function textoDoAviso(
  fase: Exclude<FasePrazo, 'antes'>,
  p: { nome: string; mesExtenso: string; dias: number; prazo: string; rascunho: boolean },
): TextoAviso {
  const comecou = p.rascunho ? ' Você já começou: falta só enviar.' : ''
  if (fase === 'cordial') {
    return {
      titulo: `${p.nome}, já dá para enviar o seu relatório de ${p.mesExtenso}`,
      corpo: `O prazo é dia ${p.prazo}. É rápido: o Portal já traz o que você avaliou no mês.${comecou}`,
    }
  }
  if (fase === 'reta_final') {
    return {
      titulo: quandoVence(p.dias, p.mesExtenso),
      corpo: `O envio é até o dia ${p.prazo}. Logo depois, a Coordenação encaminha os relatórios ao RH, e o seu faz parte.${comecou}`,
    }
  }
  return {
    titulo: `O prazo do relatório de ${p.mesExtenso} já passou`,
    corpo: `Era dia ${p.prazo}. Pedimos que envie ainda hoje, por favor: a Coordenação precisa encaminhar os relatórios ao RH e o seu ainda não chegou.${comecou}`,
  }
}

export interface AvisoRelatorio {
  /** Deve aparecer aviso para esta pessoa agora? */
  ativo: boolean
  fase: FasePrazo
  mesRef: string
  mesExtenso: string
  dias: number
  prazo: string
  rascunho: boolean
  nome: string
}

/** Situação do relatório do mês anterior para quem está logado. `hoje` só é passado em testes. */
export function useAvisoRelatorio(hoje: Date = new Date()): AvisoRelatorio {
  const { profile } = useAuth()
  const fase = faseDoPrazo(hoje)
  const mesRef = mesReferenciaDoPrazo(hoje)
  const obrigado = obrigadoARelatorio(profile)

  const { data: relatorio, isFetched } = useQuery({
    queryKey: ['aviso-relatorio', profile?.id, mesRef],
    queryFn: async () => {
      const { data } = await supabase
        .from('relatorios_mensais')
        .select('status')
        .eq('usuario_id', profile!.id)
        .eq('mes_referencia', mesRef)
        .maybeSingle()
      return (data ?? null) as { status: string } | null
    },
    enabled: !!profile?.id && obrigado && fase !== 'antes',
    staleTime: 60 * 1000,
  })

  const enviado = relatorio?.status === 'enviado'
  return {
    ativo: obrigado && fase !== 'antes' && isFetched && !enviado,
    fase,
    mesRef,
    mesExtenso: mesPorExtenso(mesRef),
    dias: diasParaOPrazo(hoje),
    prazo: prazoCurto(hoje),
    rascunho: relatorio?.status === 'rascunho',
    nome: (profile?.nome ?? '').split(' ')[0],
  }
}

/** Mensagem pronta para a Coordenação copiar e mandar (WhatsApp, e-mail…) a quem ainda não enviou. */
export function mensagemDeCobranca(p: { nomes: string[]; mesExtenso: string; fase: FasePrazo; prazo: string }): string {
  const quem = p.nomes.join(', ')
  const abertura = p.fase === 'vencido'
    ? `O prazo (dia ${p.prazo}) do relatório mensal de ${p.mesExtenso} já passou e ainda não recebi o de: ${quem}.`
    : `Lembrete do relatório mensal de ${p.mesExtenso}: o prazo é dia ${p.prazo} e ainda falta o envio de: ${quem}.`
  const fecho = p.fase === 'vencido'
    ? 'Peço que enviem ainda hoje, pois preciso encaminhar os relatórios ao RH.'
    : 'Leva poucos minutos e o Portal já traz as suas atividades do mês.'
  return `${abertura}\n\nO relatório é feito no Portal da CCAD, em Central de Relatórios > Meus Relatórios Mensais (https://projeto-ccad.vercel.app/central-relatorios). ${fecho}\n\nObrigado!`
}

