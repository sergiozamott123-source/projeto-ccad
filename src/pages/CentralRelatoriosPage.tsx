import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Download, FileSpreadsheet, Save, Trash2, ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react'
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
  busca: string
  avaliadorId: string
  statusAvaliacao: 'qualquer' | 'sem_avaliacao' | 'aguardando_confirmacao' | 'confirmada' | 'devolvida'
  avaliacaoDe: string
  avaliacaoAte: string
}

const FILTROS_INICIAIS: FiltrosState = {
  setor: '', classe: '', destinacaoFinal: '', anoDe: '', anoAte: '', requerRevisao: 'qualquer', busca: '',
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

export function CentralRelatoriosPage() {
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

  const linhas = resultado?.linhas ?? []
  const total = resultado?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const colunasExibidas = COLUNAS.filter(c => colunasSelecionadas.includes(c.key))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Central de Relatórios</h1>
        <p className="text-gray-500 text-sm mt-0.5">Monte relatórios personalizados sobre a base de processos do acervo.</p>
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
    </div>
  )
}
