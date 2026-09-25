import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Download, FileSpreadsheet, Save, Trash2, ChevronLeft, ChevronRight, FolderOpen, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Processo, RelatorioSalvo } from '@/lib/database.types'
import { CDTIV_LOGO_LIGHTBG } from '@/assets/cdtivLogo'
import clsx from 'clsx'

interface FiltrosState {
  setor: string
  classe: string
  destinacaoFinal: string
  anoDe: string
  anoAte: string
  requerRevisao: 'qualquer' | 'sim' | 'nao'
  classificacao: 'qualquer' | 'sim' | 'nao'
  busca: string
  avaliadorId: string
  statusAvaliacao: 'qualquer' | 'sem_avaliacao' | 'aguardando_confirmacao' | 'confirmada' | 'devolvida'
  avaliacaoDe: string
  avaliacaoAte: string
}

const FILTROS_INICIAIS: FiltrosState = {
  setor: '', classe: '', destinacaoFinal: '', anoDe: '', anoAte: '', requerRevisao: 'qualquer', classificacao: 'qualquer', busca: '',
  avaliadorId: '', statusAvaliacao: 'qualquer', avaliacaoDe: '', avaliacaoAte: '',
}

const STATUS_AVALIACAO_LABEL: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação',
  confirmada: 'Confirmada',
  devolvida: 'Devolvida',
}

const COLUNAS: { key: string; label: string }[] = [
  { key: 'numero_documento', label: 'Nº Documento' },
  { key: 'interessado', label: 'Interessado' },
  { key: 'assunto_processo', label: 'Assunto' },
  { key: 'ano_producao', label: 'Ano' },
  { key: 'caixa.numero', label: 'Caixa' },
  { key: 'setor_origem', label: 'Setor' },
  { key: 'ttd.codigo', label: 'Código TTD' },
  { key: 'ttd.classe', label: 'Classe' },
  { key: 'ttd.serie', label: 'Série' },
  { key: 'ttd.destinacao_final', label: 'Destinação Final' },
  { key: 'requer_revisao_manual', label: 'Requer Revisão' },
  { key: 'avaliacao.avaliador', label: 'Avaliador' },
  { key: 'avaliacao.data', label: 'Data da Avaliação' },
  { key: 'avaliacao.status', label: 'Status da Avaliação' },
  { key: 'avaliacao.confirmado_por', label: 'Confirmado por' },
  { key: 'avaliacao.confirmado_em', label: 'Confirmado em' },
]

const COLUNAS_PADRAO = [
  'numero_documento', 'interessado', 'assunto_processo', 'setor_origem', 'ttd.classe',
  'avaliacao.avaliador', 'avaliacao.status',
]

const PAGE_SIZE = 50

// Agrupamento de "Setor de origem" para o relatório de produção/avaliação
// por setor (Etapa 4). O campo já teve texto livre por muito tempo (a lista
// oficial só existe desde a Fase 17), então o mesmo setor real aparece hoje
// gravado de formas diferentes — ex.: "GECON", "GECON - PROCESSO ELIMINADO"
// e "Gecon" são o mesmo setor. Isso só agrupa a EXIBIÇÃO deste relatório;
// não muda nada gravado nos processos nem na lista de setores do sistema.
// Sérgio confirmou essa normalização em 23/09/2026.
interface GrupoSetor { nome: string; variantes: string[] }

const GRUPOS_SETOR: GrupoSetor[] = [
  { nome: 'GECON', variantes: ['GECON', 'GECON - PROCESSO ELIMINADO', 'Gecon'] },
  { nome: 'NFC', variantes: ['NFC', 'NFC - PROCESSO ELIMINADO', 'NFC - PROC. ELIMINADO'] },
  { nome: 'DAF', variantes: ['DAF', 'DAF - PROCESSO ELIMINADO'] },
  { nome: 'NRH', variantes: ['NRH', 'NRH - PROCESSO ELIMINADO'] },
  { nome: 'NPA', variantes: ['NPA', 'NPA - PROCESSO ELIMINADO'] },
  { nome: 'DDN', variantes: ['DDN', 'DDN - PROCESSO ELIMINADO'] },
  { nome: 'FACITEC', variantes: ['FACITEC', 'FACITEC - PROCESSO ELIMINADO'] },
  { nome: 'DTUR', variantes: ['DTUR', 'DTUR - PROCESSO ELIMINADO'] },
  { nome: 'NCC', variantes: ['NCC', 'NCC - PROCESSO ELIMINADO'] },
  { nome: 'ASJUR', variantes: ['ASJUR', 'ASJUR - PROCESSO ELIMINADO', 'ASSJUR'] },
  { nome: 'NSP', variantes: ['NSP', 'NSP - PROCESSO ELIMINADO'] },
  { nome: 'NMS', variantes: ['NMS', 'NMS - PROCESSO ELIMINADO', 'NMS - PEOCESSO'] },
  { nome: 'GAF', variantes: ['GAF', 'GAF - PROCESSO ELIMINADO', 'GAF - PROC. ELIMINADO'] },
  { nome: 'DINOV', variantes: ['DINOV', 'DINOV - PROCESSO ELIMINADO', 'DINOV - PROCESSO ELIMNADO'] },
  { nome: 'PRE', variantes: ['PRE', 'PRE - PROCESSO ELIMINADO'] },
  { nome: 'Departamento Pessoal', variantes: ['Departº Pessoal', 'Depart.Pessoal', 'Dep. Pessoal', 'Dep.Pessoal', 'DP'] },
  { nome: 'NTI', variantes: ['NTI'] },
  { nome: 'GECOM', variantes: ['GECOM'] },
  { nome: 'GCON', variantes: ['GCON'] },
  { nome: 'GINOV', variantes: ['GINOV'] },
  { nome: 'DIN', variantes: ['DIN'] },
  { nome: 'Contabilidade', variantes: ['Contabilidade'] },
  { nome: 'UECI', variantes: ['UECI'] },
  { nome: 'SUPTUR', variantes: ['SUPTUR'] },
  { nome: 'GEPED', variantes: ['GEPED'] },
  { nome: 'SUPCOM', variantes: ['SUPCOM'] },
  { nome: 'SUPDEC', variantes: ['SUPDEC'] },
  { nome: 'SCTI', variantes: ['SCTI'] },
]

interface LinhaProducaoSetor {
  setor: string
  total: number
  avaliados: number
}

// A consulta traz todas as avaliações do processo (pode ter mais de uma se
// alguma foi devolvida e reavaliada depois), ordenadas da mais recente para
// a mais antiga — a mais recente é a que representa a situação atual dele.
function avaliacaoAtual(p: Processo) {
  return p.avaliacoes && p.avaliacoes.length > 0 ? p.avaliacoes[0] : null
}

function getValor(p: Processo, key: string): string | number {
  const aval = avaliacaoAtual(p)
  switch (key) {
    case 'numero_documento': return p.numero_documento ?? ''
    case 'interessado': return p.interessado ?? ''
    case 'assunto_processo': return p.assunto_processo ?? ''
    case 'ano_producao': return p.ano_producao ?? ''
    case 'caixa.numero': return p.caixa?.numero ?? ''
    case 'setor_origem': return p.setor_origem ?? p.caixa?.setor ?? ''
    case 'ttd.codigo': return p.ttd?.codigo ?? ''
    case 'ttd.classe': return p.ttd?.classe ?? ''
    case 'ttd.serie': return p.ttd?.serie ?? ''
    case 'ttd.destinacao_final': return p.ttd?.destinacao_final ?? ''
    case 'requer_revisao_manual': return p.requer_revisao_manual ? 'Sim' : 'Não'
    case 'avaliacao.avaliador': return aval?.avaliador?.nome ?? 'Não avaliado'
    case 'avaliacao.data': return aval ? new Date(aval.created_at).toLocaleDateString('pt-BR') : '—'
    case 'avaliacao.status': return aval ? (STATUS_AVALIACAO_LABEL[aval.status] ?? aval.status) : 'Não avaliado'
    case 'avaliacao.confirmado_por': return aval?.confirmador?.nome ?? '—'
    case 'avaliacao.confirmado_em': return aval?.confirmado_em ? new Date(aval.confirmado_em).toLocaleDateString('pt-BR') : '—'
    default: return ''
  }
}

function descreverFiltros(f: FiltrosState): string {
  const partes: string[] = []
  if (f.setor) partes.push(`Setor: ${f.setor}`)
  if (f.classe) partes.push(`Classe: ${f.classe}`)
  if (f.destinacaoFinal) partes.push(`Destinação: ${f.destinacaoFinal}`)
  if (f.anoDe || f.anoAte) partes.push(`Ano: ${f.anoDe || '—'}–${f.anoAte || '—'}`)
  if (f.requerRevisao !== 'qualquer') partes.push(`Requer revisão: ${f.requerRevisao === 'sim' ? 'Sim' : 'Não'}`)
  if (f.classificacao !== 'qualquer') partes.push(`Classificação: ${f.classificacao === 'sim' ? 'Já classificado' : 'Ainda não classificado'}`)
  if (f.busca) partes.push(`Busca: "${f.busca}"`)
  if (f.statusAvaliacao === 'sem_avaliacao') partes.push('Status da avaliação: Não avaliado')
  else if (f.statusAvaliacao !== 'qualquer') partes.push(`Status da avaliação: ${STATUS_AVALIACAO_LABEL[f.statusAvaliacao]}`)
  if (f.avaliacaoDe || f.avaliacaoAte) partes.push(`Data da avaliação: ${f.avaliacaoDe || '—'}–${f.avaliacaoAte || '—'}`)
  return partes.length ? partes.join(' · ') : 'Sem filtros aplicados'
}

const AVALIACAO_CAMPOS = 'status,decisao,created_at,confirmado_em,avaliado_por,confirmado_por,avaliador:avaliado_por(nome),confirmador:confirmado_por(nome)'

// !inner nos joins somente quando há filtro na tabela relacionada, senão
// processos sem TTD/caixa/avaliação correspondente ficariam excluídos de
// toda consulta
function buildQuery(filtros: FiltrosState) {
  // setor agora é filtrado direto em processos.setor_origem (não precisa
  // mais de !inner no join de caixa para isso).
  const caixaJoin = 'caixa:caixa_id(numero,setor,status)'
  const ttdJoin = (filtros.classe || filtros.destinacaoFinal)
    ? 'ttd:ttd_codigo_id!inner(codigo,classe,serie,assunto,destinacao_final,legislacao)'
    : 'ttd:ttd_codigo_id(codigo,classe,serie,assunto,destinacao_final,legislacao)'

  const semAvaliacao = filtros.statusAvaliacao === 'sem_avaliacao'
  const temFiltroAvaliacao = !!filtros.avaliadorId
    || (filtros.statusAvaliacao !== 'qualquer' && !semAvaliacao)
    || !!filtros.avaliacaoDe || !!filtros.avaliacaoAte
  const avaliacaoJoin = semAvaliacao
    ? 'avaliacoes(id)'
    : temFiltroAvaliacao
    ? `avaliacoes!inner(${AVALIACAO_CAMPOS})`
    : `avaliacoes(${AVALIACAO_CAMPOS})`

  let query = supabase
    .from('processos')
    .select(`*, ${caixaJoin}, ${ttdJoin}, ${avaliacaoJoin}`, { count: 'exact' })

  if (filtros.setor) query = query.eq('setor_origem', filtros.setor)
  if (filtros.classe) query = query.eq('ttd.classe', filtros.classe)
  if (filtros.destinacaoFinal) query = query.eq('ttd.destinacao_final', filtros.destinacaoFinal)
  if (filtros.anoDe) query = query.gte('ano_producao', Number(filtros.anoDe))
  if (filtros.anoAte) query = query.lte('ano_producao', Number(filtros.anoAte))
  if (filtros.requerRevisao === 'sim') query = query.eq('requer_revisao_manual', true)
  if (filtros.requerRevisao === 'nao') query = query.eq('requer_revisao_manual', false)
  // "Classificação" pergunta se o processo já tem um código do TTD associado
  // (ttd_codigo_id preenchido), diferente dos filtros de classe/destinação
  // acima, que perguntam QUAL classe/destinação ele tem.
  if (filtros.classificacao === 'sim') query = query.not('ttd_codigo_id', 'is', null)
  if (filtros.classificacao === 'nao') query = query.is('ttd_codigo_id', null)
  if (filtros.busca) {
    query = query.or(`numero_documento.ilike.%${filtros.busca}%,interessado.ilike.%${filtros.busca}%,assunto_processo.ilike.%${filtros.busca}%`)
  }
  if (semAvaliacao) query = query.is('avaliacoes.id', null)
  else if (filtros.statusAvaliacao !== 'qualquer') query = query.eq('avaliacoes.status', filtros.statusAvaliacao)
  if (filtros.avaliadorId) query = query.eq('avaliacoes.avaliado_por', filtros.avaliadorId)
  if (filtros.avaliacaoDe) query = query.gte('avaliacoes.created_at', filtros.avaliacaoDe)
  if (filtros.avaliacaoAte) query = query.lte('avaliacoes.created_at', `${filtros.avaliacaoAte}T23:59:59`)

  if (!semAvaliacao) query = query.order('created_at', { ascending: false, foreignTable: 'avaliacoes' })

  const ordenarPorAno = filtros.destinacaoFinal === 'Eliminação'
  query = query.order(ordenarPorAno ? 'ano_producao' : 'created_at', { ascending: ordenarPorAno })

  return query
}

const STATUS_JA_AVALIADO = ['confirmada', 'aguardando_confirmacao']

// Conta processos usando `head: true` (só pede o total, nunca as linhas) —
// o resultado é exato mesmo quando o grupo tem milhares de processos,
// nunca esbarra no corte de 1.000 linhas do Supabase (mesma lição da
// Correção 3 do Dashboard, que só apareceu por buscar linhas de verdade
// em vez de só contar).
async function contarProcessos(
  aplicarFiltroSetor: (q: any) => any,
  soAvaliados: boolean,
  anoDe: string,
  anoAte: string,
): Promise<number> {
  let query: any = soAvaliados
    ? supabase
        .from('processos')
        .select('*, avaliacoes!inner(status)', { count: 'exact', head: true })
        .in('avaliacoes.status', STATUS_JA_AVALIADO)
    : supabase.from('processos').select('*', { count: 'exact', head: true })
  query = aplicarFiltroSetor(query)
  if (anoDe) query = query.gte('ano_producao', Number(anoDe))
  if (anoAte) query = query.lte('ano_producao', Number(anoAte))
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Relatório de produção/avaliação por setor (Etapa 4 do plano em
// claude/plano-central-relatorios.md). "Outros / não identificado" é
// calculado por SUBTRAÇÃO do total geral, em vez de uma consulta "não está
// em nenhum grupo conhecido" — assim os números sempre batem exatamente
// com o total real de processos, mesmo que apareça no futuro um valor de
// setor que ainda não está mapeado em GRUPOS_SETOR.
async function buscarProducaoPorSetor(anoDe: string, anoAte: string): Promise<LinhaProducaoSetor[]> {
  const [totalGeral, avaliadosGeral] = await Promise.all([
    contarProcessos(q => q, false, anoDe, anoAte),
    contarProcessos(q => q, true, anoDe, anoAte),
  ])

  const gruposComContagem = await Promise.all(
    GRUPOS_SETOR.map(async (grupo): Promise<LinhaProducaoSetor> => {
      const [total, avaliados] = await Promise.all([
        contarProcessos(q => q.in('setor_origem', grupo.variantes), false, anoDe, anoAte),
        contarProcessos(q => q.in('setor_origem', grupo.variantes), true, anoDe, anoAte),
      ])
      return { setor: grupo.nome, total, avaliados }
    }),
  )

  // "Não informado" cobre tanto setor_origem nulo quanto texto vazio — duas
  // consultas simples (.is / .eq) em vez de um filtro OR em texto, mais
  // fácil de conferir que está correto.
  const [nuloTotal, nuloAvaliados, vazioTotal, vazioAvaliados] = await Promise.all([
    contarProcessos(q => q.is('setor_origem', null), false, anoDe, anoAte),
    contarProcessos(q => q.is('setor_origem', null), true, anoDe, anoAte),
    contarProcessos(q => q.eq('setor_origem', ''), false, anoDe, anoAte),
    contarProcessos(q => q.eq('setor_origem', ''), true, anoDe, anoAte),
  ])
  const naoInformadoTotal = nuloTotal + vazioTotal
  const naoInformadoAvaliados = nuloAvaliados + vazioAvaliados

  const linhas = gruposComContagem.filter(l => l.total > 0)
  if (naoInformadoTotal > 0) {
    linhas.push({ setor: 'Não informado', total: naoInformadoTotal, avaliados: naoInformadoAvaliados })
  }

  const somaConhecidaTotal = gruposComContagem.reduce((s, l) => s + l.total, 0) + naoInformadoTotal
  const somaConhecidaAvaliados = gruposComContagem.reduce((s, l) => s + l.avaliados, 0) + naoInformadoAvaliados
  const outrosTotal = Math.max(0, totalGeral - somaConhecidaTotal)
  const outrosAvaliados = Math.max(0, avaliadosGeral - somaConhecidaAvaliados)
  if (outrosTotal > 0) {
    linhas.push({ setor: 'Outros / não identificado', total: outrosTotal, avaliados: outrosAvaliados })
  }

  return linhas.sort((a, b) => b.total - a.total)
}

export function RelatoriosDiversosTab() {
  const { profile } = useAuth()
  const qc = useQueryClient()

  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIAIS)
  const [colunasSelecionadas, setColunasSelecionadas] = useState<string[]>(COLUNAS_PADRAO)
  const [page, setPage] = useState(1)
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null)
  const [avisoTruncado, setAvisoTruncado] = useState(false)
  const [mostrarSalvar, setMostrarSalvar] = useState(false)
  const [nomeSalvar, setNomeSalvar] = useState('')

  function atualizarFiltro(patch: Partial<FiltrosState>) {
    setFiltros(f => ({ ...f, ...patch }))
    setPage(1)
  }

  // Atalhos de um clique (Etapa 3 do plano): limpam todos os filtros e
  // aplicam de uma vez a combinação que representa o recorte pedido, em vez
  // do usuário montar isso manualmente toda vez.
  //
  // "Processos em avaliação" (definido pelo Sérgio em 23/09/2026) = status
  // "Aguardando confirmação": já foram analisados por um avaliador, mas
  // ainda esperam a confirmação da Coordenação. Não inclui os processos
  // ainda sem nenhuma avaliação (esses ficam no filtro "Status da avaliação
  // = Não avaliado", que já existe separadamente).
  function aplicarAtalho(patch: Partial<FiltrosState>) {
    setFiltros({ ...FILTROS_INICIAIS, ...patch })
    setPage(1)
  }

  const { data: setores } = useQuery({
    queryKey: ['setores-distintos'],
    queryFn: async () => {
      const { data } = await supabase.from('processos').select('setor_origem').not('setor_origem', 'is', null)
      return Array.from(new Set((data ?? []).map(d => d.setor_origem).filter(Boolean))).sort() as string[]
    },
  })

  const { data: classes } = useQuery({
    queryKey: ['classes-distintas'],
    queryFn: async () => {
      const { data } = await supabase.from('ttd_codigos').select('classe')
      return Array.from(new Set((data ?? []).map(d => d.classe).filter(Boolean))).sort() as string[]
    },
  })

  const { data: destinacoes } = useQuery({
    queryKey: ['destinacoes-distintas'],
    queryFn: async () => {
      const { data } = await supabase.from('ttd_codigos').select('destinacao_final')
      return Array.from(new Set((data ?? []).map(d => d.destinacao_final).filter(Boolean))).sort() as string[]
    },
  })

  const { data: avaliadores } = useQuery({
    queryKey: ['avaliadores-para-filtro'],
    queryFn: async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nome')
        .or('pode_avaliar_processos.eq.true,papel.eq.coordenador,papel.eq.coordenador_substituto')
        .order('nome')
      return (data ?? []) as { id: string; nome: string }[]
    },
  })

  const { data: resultado, isLoading } = useQuery({
    queryKey: ['central-relatorios-resultados', filtros, page],
    queryFn: async () => {
      const { data, count, error } = await buildQuery(filtros).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      if (error) throw error
      return { linhas: (data ?? []) as Processo[], total: count ?? 0 }
    },
  })

  const { data: relatoriosSalvos } = useQuery({
    queryKey: ['relatorios-salvos'],
    queryFn: async () => {
      const { data } = await supabase.from('relatorios_salvos').select('*').order('created_at', { ascending: false })
      return (data ?? []) as RelatorioSalvo[]
    },
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('relatorios_salvos').insert({
        nome: nomeSalvar,
        filtros,
        colunas: colunasSelecionadas,
        criado_por: profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['relatorios-salvos'] })
      setNomeSalvar('')
      setMostrarSalvar(false)
    },
  })

  const excluirSalvo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('relatorios_salvos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['relatorios-salvos'] }),
  })

  // Relatório de produção/avaliação por setor (Etapa 4). "Ano de produção"
  // é o mesmo período usado nos filtros acima, aqui isolado porque este é
  // um relatório agregado à parte, não uma lista de processos.
  const [anoSetorDe, setAnoSetorDe] = useState('')
  const [anoSetorAte, setAnoSetorAte] = useState('')
  const [exportandoSetor, setExportandoSetor] = useState<'excel' | 'pdf' | null>(null)

  const { data: producaoPorSetor, isLoading: carregandoProducaoSetor } = useQuery({
    queryKey: ['relatorios-diversos-producao-setor', anoSetorDe, anoSetorAte],
    queryFn: () => buscarProducaoPorSetor(anoSetorDe, anoSetorAte),
  })

  function abrirSalvo(r: RelatorioSalvo) {
    setFiltros({ ...FILTROS_INICIAIS, ...(r.filtros as Partial<FiltrosState>) })
    setColunasSelecionadas(r.colunas)
    setPage(1)
  }

  function toggleColuna(key: string) {
    setColunasSelecionadas(cs => cs.includes(key) ? cs.filter(c => c !== key) : [...cs, key])
  }

  async function exportarExcel() {
    setExportando('excel')
    try {
      const { data, count, error } = await buildQuery(filtros).limit(5000)
      if (error) throw error
      setAvisoTruncado((count ?? 0) > 5000)
      const colunas = COLUNAS.filter(c => colunasSelecionadas.includes(c.key))
      const linhas = ((data ?? []) as Processo[]).map(p => {
        const obj: Record<string, string | number> = {}
        colunas.forEach(c => { obj[c.label] = getValor(p, c.key) })
        return obj
      })
      const ws = XLSX.utils.json_to_sheet(linhas)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Relatório')
      XLSX.writeFile(wb, `relatorio-acervo-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setExportando(null)
    }
  }

  async function exportarPdf() {
    setExportando('pdf')
    try {
      const { data, count, error } = await buildQuery(filtros).limit(5000)
      if (error) throw error
      setAvisoTruncado((count ?? 0) > 5000)
      const colunas = COLUNAS.filter(c => colunasSelecionadas.includes(c.key))
      const linhas = ((data ?? []) as Processo[]).map(p => colunas.map(c => String(getValor(p, c.key))))

      const doc = new jsPDF({ orientation: 'landscape' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const logoW = 30
      const logoH = logoW / (256 / 124) // proporção original do arquivo da logo
      doc.addImage(CDTIV_LOGO_LIGHTBG, 'JPEG', pageWidth - 14 - logoW, 8, logoW, logoH)
      doc.setFontSize(14)
      doc.text('Relatório do Acervo — CCAD/CDTIV', 14, 15)
      doc.setFontSize(9)
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} — ${descreverFiltros(filtros)}`, 14, 21)
      autoTable(doc, {
        startY: 26,
        head: [colunas.map(c => c.label)],
        body: linhas,
        styles: { fontSize: 8 },
      })
      doc.save(`relatorio-acervo-${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExportando(null)
    }
  }

  function descreverPeriodoSetor() {
    if (!anoSetorDe && !anoSetorAte) return 'Todos os anos de produção'
    return `Ano de produção: ${anoSetorDe || '—'}–${anoSetorAte || '—'}`
  }

  function exportarProducaoSetorExcel() {
    if (!producaoPorSetor?.length) return
    setExportandoSetor('excel')
    try {
      const linhas = producaoPorSetor.map(l => ({
        Setor: l.setor,
        'Processos produzidos': l.total,
        'Processos avaliados': l.avaliados,
        '% avaliado': l.total > 0 ? `${Math.round((l.avaliados / l.total) * 100)}%` : '—',
      }))
      const ws = XLSX.utils.json_to_sheet(linhas)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Por setor')
      XLSX.writeFile(wb, `relatorio-producao-setor-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setExportandoSetor(null)
    }
  }

  function exportarProducaoSetorPdf() {
    if (!producaoPorSetor?.length) return
    setExportandoSetor('pdf')
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const logoW = 30
      const logoH = logoW / (256 / 124)
      doc.addImage(CDTIV_LOGO_LIGHTBG, 'JPEG', pageWidth - 14 - logoW, 8, logoW, logoH)
      doc.setFontSize(14)
      doc.text('Produção e avaliação por setor — CCAD/CDTIV', 14, 15)
      doc.setFontSize(9)
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} — ${descreverPeriodoSetor()}`, 14, 21)
      autoTable(doc, {
        startY: 26,
        head: [['Setor', 'Processos produzidos', 'Processos avaliados', '% avaliado']],
        body: producaoPorSetor.map(l => [
          l.setor,
          String(l.total),
          String(l.avaliados),
          l.total > 0 ? `${Math.round((l.avaliados / l.total) * 100)}%` : '—',
        ]),
        styles: { fontSize: 9 },
      })
      doc.save(`relatorio-producao-setor-${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExportandoSetor(null)
    }
  }

  const linhas = resultado?.linhas ?? []
  const total = resultado?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const colunasExibidas = COLUNAS.filter(c => colunasSelecionadas.includes(c.key))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Relatórios Diversos</h2>
        <p className="text-gray-500 text-sm mt-0.5">Monte relatórios personalizados sobre a base de processos do acervo.</p>
      </div>

      {/* Atalhos rápidos */}
      <div className="card p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap size={15} className="text-teal-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Atalhos rápidos</h2>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Aplica de uma vez a combinação de filtros do recorte, substituindo os filtros atuais.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => aplicarAtalho({ destinacaoFinal: 'Eliminação' })}
          >
            Processos já elimináveis
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => aplicarAtalho({ classificacao: 'sim' })}
          >
            Processos já classificados
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => aplicarAtalho({ statusAvaliacao: 'aguardando_confirmacao' })}
          >
            Processos em avaliação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Setor</label>
            <select className="input" value={filtros.setor} onChange={e => atualizarFiltro({ setor: e.target.value })}>
              <option value="">Todos</option>
              {(setores ?? []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Classe (TTD)</label>
            <select className="input" value={filtros.classe} onChange={e => atualizarFiltro({ classe: e.target.value })}>
              <option value="">Todas</option>
              {(classes ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Destinação final</label>
            <select className="input" value={filtros.destinacaoFinal} onChange={e => atualizarFiltro({ destinacaoFinal: e.target.value })}>
              <option value="">Todas</option>
              {(destinacoes ?? []).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ano de produção — de</label>
            <input type="number" className="input" value={filtros.anoDe} onChange={e => atualizarFiltro({ anoDe: e.target.value })} />
          </div>
          <div>
            <label className="label">Ano de produção — até</label>
            <input type="number" className="input" value={filtros.anoAte} onChange={e => atualizarFiltro({ anoAte: e.target.value })} />
          </div>
          <div>
            <label className="label">Requer revisão manual</label>
            <select
              className="input"
              value={filtros.requerRevisao}
              onChange={e => atualizarFiltro({ requerRevisao: e.target.value as FiltrosState['requerRevisao'] })}
            >
              <option value="qualquer">Qualquer</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
          <div>
            <label className="label">Classificação</label>
            <select
              className="input"
              value={filtros.classificacao}
              onChange={e => atualizarFiltro({ classificacao: e.target.value as FiltrosState['classificacao'] })}
            >
              <option value="qualquer">Qualquer</option>
              <option value="sim">Já classificado</option>
              <option value="nao">Ainda não classificado</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label">Busca livre (nº do documento, interessado ou assunto)</label>
            <input className="input" value={filtros.busca} onChange={e => atualizarFiltro({ busca: e.target.value })} />
          </div>
        </div>

        {/* Filtros da camada de avaliação */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Avaliação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Avaliador</label>
              <select className="input" value={filtros.avaliadorId} onChange={e => atualizarFiltro({ avaliadorId: e.target.value })}>
                <option value="">Todos</option>
                {(avaliadores ?? []).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status da avaliação</label>
              <select
                className="input"
                value={filtros.statusAvaliacao}
                onChange={e => atualizarFiltro({ statusAvaliacao: e.target.value as FiltrosState['statusAvaliacao'] })}
              >
                <option value="qualquer">Qualquer</option>
                <option value="sem_avaliacao">Não avaliado</option>
                <option value="aguardando_confirmacao">Aguardando confirmação</option>
                <option value="confirmada">Confirmada</option>
                <option value="devolvida">Devolvida</option>
              </select>
            </div>
            <div>
              <label className="label">Data da avaliação — de</label>
              <input type="date" className="input" value={filtros.avaliacaoDe} onChange={e => atualizarFiltro({ avaliacaoDe: e.target.value })} />
            </div>
            <div>
              <label className="label">Data da avaliação — até</label>
              <input type="date" className="input" value={filtros.avaliacaoAte} onChange={e => atualizarFiltro({ avaliacaoAte: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Colunas */}
        <div>
          <label className="label mb-2 block">Colunas do relatório</label>
          <div className="flex flex-wrap gap-2">
            {COLUNAS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleColuna(c.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  colunasSelecionadas.includes(c.key)
                    ? 'bg-teal-500 border-teal-500 text-white'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="btn-secondary text-sm"
            disabled={exportando !== null || colunasExibidas.length === 0}
            onClick={exportarExcel}
          >
            <FileSpreadsheet size={16} /> {exportando === 'excel' ? 'Exportando…' : 'Exportar Excel'}
          </button>
          <button
            className="btn-secondary text-sm"
            disabled={exportando !== null || colunasExibidas.length === 0}
            onClick={exportarPdf}
          >
            <Download size={16} /> {exportando === 'pdf' ? 'Exportando…' : 'Exportar PDF'}
          </button>
          <button className="btn-secondary text-sm" onClick={() => setMostrarSalvar(v => !v)}>
            <Save size={16} /> Salvar como relatório
          </button>
        </div>

        {mostrarSalvar && (
          <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-3">
            <input
              className="input flex-1 min-w-[200px]"
              placeholder="Nome do relatório"
              value={nomeSalvar}
              onChange={e => setNomeSalvar(e.target.value)}
            />
            <button
              className="btn-primary text-sm"
              disabled={!nomeSalvar.trim() || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button className="btn-secondary text-sm" onClick={() => setMostrarSalvar(false)}>Cancelar</button>
          </div>
        )}

        {avisoTruncado && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            Resultado truncado em 5.000 linhas — refine os filtros para um relatório mais preciso.
          </p>
        )}
      </div>

      {/* Resultados */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Resultados</h2>
          <span className="text-sm text-gray-500">{total.toLocaleString('pt-BR')} processo(s)</span>
        </div>

        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Carregando…</p>
        ) : linhas.length === 0 ? (
          <p className="text-center py-10 text-gray-400">Nenhum processo encontrado com esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-400">
                  {colunasExibidas.map(c => <th key={c.key} className="py-2 pr-4 font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map(p => (
                  <tr key={p.id} className="border-b last:border-0">
                    {colunasExibidas.map(c => (
                      <td key={c.key} className="py-2 pr-4 text-gray-700">{getValor(p, c.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <button
              className="btn-secondary text-sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <span className="text-xs text-gray-400">Página {page} de {totalPaginas}</span>
            <button
              className="btn-secondary text-sm"
              disabled={page >= totalPaginas}
              onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}
            >
              Próxima <ChevronRight size={16} />
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 border-t pt-3">
          Ordenado do processo mais antigo para o mais recente. Para relatórios de eliminação, confirme o prazo exato de guarda na legislação/TTD de cada classe antes de decidir — este relatório aproxima pela data de produção, não calcula uma data de eliminação exata.
        </p>
      </div>

      {/* Relatórios salvos */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Relatórios salvos</h2>
        {(relatoriosSalvos ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum relatório salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {(relatoriosSalvos ?? []).map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.nome}</p>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn-secondary text-xs py-1.5" onClick={() => abrirSalvo(r)}>
                    <FolderOpen size={14} /> Abrir
                  </button>
                  <button
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                    title="Excluir"
                    onClick={() => excluirSalvo.mutate(r.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Produção e avaliação por setor — Etapa 4 */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <div>
            <h2 className="font-semibold text-gray-900">Produção e avaliação por setor</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Quantos processos cada setor produziu e quantos já foram avaliados, com o percentual.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="label">Ano de produção — de</label>
              <input
                type="number"
                className="input w-28"
                value={anoSetorDe}
                onChange={e => setAnoSetorDe(e.target.value)}
              />
            </div>
            <div>
              <label className="label">até</label>
              <input
                type="number"
                className="input w-28"
                value={anoSetorAte}
                onChange={e => setAnoSetorAte(e.target.value)}
              />
            </div>
          </div>
        </div>

        {carregandoProducaoSetor ? (
          <p className="text-center py-10 text-gray-400">Calculando…</p>
        ) : !producaoPorSetor?.length ? (
          <p className="text-center py-10 text-gray-400">Nenhum processo encontrado nesse período.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-400">
                  <th className="py-2 pr-4 font-medium">Setor</th>
                  <th className="py-2 pr-4 font-medium">Processos produzidos</th>
                  <th className="py-2 pr-4 font-medium">Processos avaliados</th>
                  <th className="py-2 pr-4 font-medium">% avaliado</th>
                </tr>
              </thead>
              <tbody>
                {producaoPorSetor.map(l => (
                  <tr key={l.setor} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-gray-800 font-medium">{l.setor}</td>
                    <td className="py-2 pr-4 text-gray-700">{l.total.toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-4 text-gray-700">{l.avaliados.toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-4 text-gray-700">
                      {l.total > 0 ? `${Math.round((l.avaliados / l.total) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-4 mt-1 border-t">
          <button
            className="btn-secondary text-sm"
            disabled={exportandoSetor !== null || !producaoPorSetor?.length}
            onClick={exportarProducaoSetorExcel}
          >
            <FileSpreadsheet size={16} /> {exportandoSetor === 'excel' ? 'Exportando…' : 'Exportar Excel'}
          </button>
          <button
            className="btn-secondary text-sm"
            disabled={exportandoSetor !== null || !producaoPorSetor?.length}
            onClick={exportarProducaoSetorPdf}
          >
            <Download size={16} /> {exportandoSetor === 'pdf' ? 'Exportando…' : 'Exportar PDF'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3 border-t pt-3">
          "Setor" agrupa variações de digitação do mesmo setor (ex.: siglas seguidas de "- PROCESSO ELIMINADO") registradas antes da lista oficial de setores existir no sistema — não altera nenhum processo, só a forma como este relatório soma os números. "Outros / não identificado" reúne registros raros que não puderam ser agrupados com confiança.
        </p>
      </div>
    </div>
  )
}
