import { Trash2, ShieldCheck, CheckCircle2, Clock, Archive, Undo2, MapPin, CalendarDays, AlertTriangle, PenLine } from 'lucide-react'
import clsx from 'clsx'

// ------------------------------------------------------------------
// Vocabulário visual compartilhado — "Eliminação" é sempre vermelho +
// lixeira, "Guarda Permanente" é sempre verde-água + escudo, em
// qualquer tela do Portal. Centralizar aqui evita que cada tela
// decida a cor/ícone por conta própria (como acontecia antes, com
// `isEliminacao` duplicado em vários arquivos — AvaliacaoProcessosCard,
// TtdCodigoPicker, RevisaoManualPage, CatalogarProcessoPage, etc.).
//
// Este é o primeiro passo de um "Design System" leve do Portal: um
// pequeno conjunto de componentes reutilizáveis, construído uma vez,
// usado em qualquer tela — em vez de cada tela reinventar o próprio
// estilo de badge/ícone. Ver proposta visual aprovada por Sérgio em
// 20/10/2026 (claude/plano-design-system-portal-ccad.md).
// ------------------------------------------------------------------

export function isEliminacao(destino: string | null | undefined) {
  return !!destino && destino.toLowerCase().includes('elimin')
}

/** Badge de destinação final (Eliminação / Guarda Permanente), com ícone fixo. */
export function DecisaoBadge({ destino, className }: { destino: string | null | undefined; className?: string }) {
  if (!destino) return <span className="text-gray-300">—</span>
  const elim = isEliminacao(destino)
  const Icon = elim ? Trash2 : ShieldCheck
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        elim
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-teal-50 text-teal-700 border-teal-200',
        className,
      )}
    >
      <Icon size={11} />
      {elim ? 'Eliminação' : 'Guarda Perm.'}
    </span>
  )
}

/** Badge de status de um código TTD (vigente / proposta / descontinuado), com ícone fixo. */
export function TtdStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (status === 'vigente') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700', className)}>
        <CheckCircle2 size={11} /> vigente
      </span>
    )
  }
  if (status === 'proposta') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-300', className)}>
        <Clock size={11} /> proposta
      </span>
    )
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500', className)}>
      <Archive size={11} /> descont.
    </span>
  )
}

/** Badge de status de uma requisição de avaliação/CEPA (pendente / concluída / cancelada), com ícone fixo. */
export function RequisicaoStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (status === 'pendente') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700', className)}>
        <Clock size={11} /> Pendente
      </span>
    )
  }
  if (status === 'concluida') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700', className)}>
        <CheckCircle2 size={11} /> Concluída
      </span>
    )
  }
  if (status === 'cancelada') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500', className)}>
        <Archive size={11} /> Cancelada
      </span>
    )
  }
  return <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500', className)}>{status}</span>
}

/** Badge de status de uma avaliação (aguardando confirmação / confirmada / devolvida), com ícone fixo. */
export function AvaliacaoStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (status === 'confirmada') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700', className)}>
        <CheckCircle2 size={11} /> Confirmada
      </span>
    )
  }
  if (status === 'devolvida') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700', className)}>
        <Undo2 size={11} /> Devolvida
      </span>
    )
  }
  if (status === 'aguardando_confirmacao') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700', className)}>
        <Clock size={11} /> Aguardando confirmação
      </span>
    )
  }
  return <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500', className)}>{status}</span>
}

/** Badge de status de um relatório mensal (rascunho / enviado / atrasado / não enviado), com ícone fixo. Reaproveitado em "Meus Relatórios Mensais" e "Relatórios da Equipe" — antes cada tela tinha seu próprio mapa de cor duplicado. */
export function RelatorioStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (status === 'enviado') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700', className)}>
        <CheckCircle2 size={11} /> Enviado
      </span>
    )
  }
  if (status === 'atrasado') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700', className)}>
        <AlertTriangle size={11} /> Atrasado
      </span>
    )
  }
  if (status === 'nao_enviado') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-500', className)}>
        <Clock size={11} /> Não enviado
      </span>
    )
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600', className)}>
      <PenLine size={11} /> Rascunho
    </span>
  )
}

/** Ícone pequeno de Setor/local — usado inline ao lado do texto do setor, sem virar um "pill" (o setor já aparece como texto simples na maioria das telas, só precisa do sinal visual). */
export function SetorIcon({ className }: { className?: string }) {
  return <MapPin size={11} className={clsx('text-gray-400 shrink-0', className)} />
}

/** Ícone pequeno de Data — mesmo princípio do SetorIcon, para datas/anos mostrados como texto simples. */
export function DataIcon({ className }: { className?: string }) {
  return <CalendarDays size={11} className={clsx('text-gray-400 shrink-0', className)} />
}
