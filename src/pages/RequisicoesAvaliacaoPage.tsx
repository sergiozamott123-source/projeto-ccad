import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, X, Plus, ClipboardPaste, UploadCloud, PackageSearch } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { RequisicaoAvaliacao } from '@/lib/database.types'
import clsx from 'clsx'

type RequisicaoLista = RequisicaoAvaliacao & {
  caixa: { numero: string; status: string } | null
  avaliador: { nome: string } | null
  criador: { nome: string } | null
}

type InteressadoOpcao = '' | 'CDTIV' | 'PMV'

interface LinhaProcesso {
  numero: string
  ano: string
  assunto: string
  setorOrigem: string
  setorOrigemNovo: string
  interessado: InteressadoOpcao
  dataUltimaMovimentacao: string
  semDataUltimaMovimentacao: boolean
}

// Quando setorOrigem === '__novo__', o setor de fato está sendo
// digitado em setorOrigemNovo (mesmo esquema do campo "Setor de
// origem padrão" logo abaixo) — esta função resolve o valor final,
// pronto para validar ou gravar.
function setorLinhaEfetivo(l: LinhaProcesso): string {
  return (l.setorOrigem === '__novo__' ? l.setorOrigemNovo : l.setorOrigem).trim()
}

function linhaVazia(setorPadrao = ''): LinhaProcesso {
  return { numero: '', ano: '', assunto: '', setorOrigem: setorPadrao, setorOrigemNovo: '', interessado: '', dataUltimaMovimentacao: '', semDataUltimaMovimentacao: false }
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

// Aceita colar direto da planilha (colunas separadas por tab) ou
// digitado à mão (separado por espaço): número do processo, ano
// (pode vir com letra junto, ex. "1993A") e o assunto que está na
// etiqueta do processo. Interessado e a data da última movimentação
// não costumam vir prontos de uma lista colada — ficam para
// preencher linha a linha na tabela abaixo, junto com os demais.
function parseLinhasColadas(texto: string, setorPadrao = ''): LinhaProcesso[] {
  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const partes = l.includes('\t') ? l.split('\t') : l.split(/\s+/)
      const [numero, ano, ...resto] = partes
      return { ...linhaVazia(setorPadrao), numero: (numero ?? '').trim(), ano: (ano ?? '').trim(), assunto: resto.join(' ').trim() }
    })
    .filter(l => l.numero)
}

// Lê a planilha (.xlsx/.xls/.csv) que a Ana/Ariadne já preencheu com a
// relação da caixa, na mesma ordem de colunas do texto colado: número
// do processo, ano de produção e assunto da etiqueta. Se a primeira
// linha parecer um cabeçalho (a coluna do "ano" não é um ano de
// verdade), ela é descartada.
async function parseArquivoPlanilha(file: File, setorPadrao = ''): Promise<LinhaProcesso[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const primeiraAba = workbook.Sheets[workbook.SheetNames[0]]
  const linhasBrutas = XLSX.utils.sheet_to_json<(string | number)[]>(primeiraAba, { header: 1, blankrows: false })

  const paraLinha = (r: (string | number)[]): LinhaProcesso => ({
    ...linhaVazia(setorPadrao),
    numero: String(r[0] ?? '').trim(),
    ano: String(r[1] ?? '').trim(),
    assunto: String(r[2] ?? '').trim(),
  })

  const semCabecalho =
    linhasBrutas.length > 0 && !/^\d{4}/.test(String(linhasBrutas[0][1] ?? '').trim())
      ? linhasBrutas.slice(1)
      : linhasBrutas

  return semCabecalho.map(paraLinha).filter(l => l.numero)
}

export function RequisicoesAvaliacaoPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [setor, setSetor] = useState('')
  const [setorNovo, setSetorNovo] = useState('')
  const [quantidadeDeclarada, setQuantidadeDeclarada] = useState('')
  const [posseConfirmada, setPosseConfirmada] = useState(false)
  const [dataEntrega, setDataEntrega] = useState(hoje())
  const [avaliadorId, setAvaliadorId] = useState('')
  const [textoColado, setTextoColado] = useState('')
  const [linhas, setLinhas] = useState<LinhaProcesso[]>([])
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false)
  const [erroArquivo, setErroArquivo] = useState('')
  const [ignorarDivergenciaQtd, setIgnorarDivergenciaQtd] = useState(false)
  const [erro, setErro] = useState('')
  const arquivoInputRef = useRef<HTMLInputElement>(null)

  const setorEfetivo = (setor === '__novo__' ? setorNovo : setor).trim()

  // Lista oficial de setores da CDTIV, para escolher nos campos de
  // setor (o padrão da entrada e o de cada linha) — cadastrada em
  // Equipe & Responsáveis. Um setor realmente novo, digitado por aqui
  // via "+ Novo setor…", é adicionado a essa lista oficial na hora de
  // enviar a requisição (ver mutação "enviar" abaixo).
  const { data: setoresExistentes } = useQuery({
    queryKey: ['setores-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setores_cdtiv').select('sigla').eq('ativo', true).order('sigla')
      if (error) throw error
      return (data ?? []).map(s => s.sigla)
    },
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
        .select('*, caixa:caixa_id(numero,status), avaliador:avaliador_id(nome), criador:criado_por(nome)')
        .order('created_at', { ascending: false })
      return (data ?? []) as RequisicaoLista[]
    },
  })

  function processarColado() {
    const novas = parseLinhasColadas(textoColado, setorEfetivo)
    if (novas.length === 0) return
    setLinhas(prev => [...prev, ...novas])
    setTextoColado('')
  }

  function atualizarLinha<K extends keyof LinhaProcesso>(i: number, campo: K, valor: LinhaProcesso[K]) {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)))
  }

  function removerLinha(i: number) {
    setLinhas(prev => prev.filter((_, idx) => idx !== i))
  }

  // Uma linha só entra na requisição se tiver todos os campos abaixo
  // preenchidos: sem eles, o avaliador chega numa tela sem informação
  // suficiente para classificar, ou o cadastro fica incompleto no
  // Arquivo Geral (número, ano, assunto, setor de origem, interessado
  // e a informação da última movimentação — mesmo que seja "não há").
  // O setor é por processo (e não mais um só para a caixa inteira)
  // porque uma mesma caixa física pode reunir processos de setores
  // diferentes.
  function linhaCompleta(l: LinhaProcesso) {
    return !!(
      l.ano.trim() &&
      l.assunto.trim() &&
      setorLinhaEfetivo(l) &&
      l.interessado &&
      (l.semDataUltimaMovimentacao || l.dataUltimaMovimentacao.trim())
    )
  }

  const linhasPreenchidas = linhas.filter(l => l.numero.trim())
  const linhasValidas = linhasPreenchidas.filter(linhaCompleta)
  const linhasIncompletas = linhasPreenchidas.filter(l => !linhaCompleta(l))

  const quantidadeDeclaradaNum = quantidadeDeclarada.trim() ? Number(quantidadeDeclarada) : null
  const divergeQuantidade =
    quantidadeDeclaradaNum != null && linhasValidas.length > 0 && linhasValidas.length !== quantidadeDeclaradaNum

  async function processarArquivo(file: File) {
    setErroArquivo('')
    try {
      const novas = await parseArquivoPlanilha(file, setorEfetivo)
      if (novas.length === 0) {
        setErroArquivo('Não encontrei nenhuma linha com número de processo nessa planilha.')
        return
      }
      setLinhas(prev => [...prev, ...novas])
    } catch {
      setErroArquivo('Não consegui ler esse arquivo. Confira se é uma planilha .xlsx, .xls ou .csv.')
    }
  }

  const podeEnviar =
    !!quantidadeDeclaradaNum &&
    posseConfirmada &&
    !!avaliadorId &&
    linhasValidas.length > 0 &&
    linhasIncompletas.length === 0 &&
    (!divergeQuantidade || ignorarDivergenciaQtd)

  const enviar = useMutation({
    mutationFn: async () => {
      if (!podeEnviar || !profile) return

      const { data: codigoEntrada, error: eCodigo } = await supabase.rpc('gerar_codigo_entrada_caixa')
      if (eCodigo) throw eCodigo

      // O setor da caixa (usado nas telas de Busca/Relatórios como
      // "setor predominante") só é gravado quando todos os processos
      // da caixa forem do mesmo setor. Se a caixa tiver processos de
      // setores diferentes, fica em branco por ali — o setor de cada
      // processo continua correto e disponível individualmente.
      const setoresDaCaixa = new Set(linhasValidas.map(l => setorLinhaEfetivo(l)))
      const setorPredominante = setoresDaCaixa.size === 1 ? [...setoresDaCaixa][0] : null

      // Qualquer setor digitado como "novo" (no padrão da entrada ou
      // em alguma linha) entra na lista oficial agora, para já aparecer
      // pronto para seleção da próxima vez — sem duplicar o que já existe.
      const { error: eSetores } = await supabase
        .from('setores_cdtiv')
        .upsert([...setoresDaCaixa].map(sigla => ({ sigla })), { onConflict: 'sigla', ignoreDuplicates: true })
      if (eSetores) throw eSetores

      const { data: novaCaixa, error: eCaixa } = await supabase
        .from('caixas')
        .insert({
          numero: codigoEntrada,
          setor: setorPredominante,
          status: 'em_avaliacao',
          quantidade_declarada: quantidadeDeclaradaNum,
        })
        .select('id')
        .single()
      if (eCaixa) throw eCaixa
      const caixaId = novaCaixa!.id

      for (const l of linhasValidas) {
        const numero = l.numero.trim()
        const anoMatch = l.ano.trim().match(/^(\d{4})(.*)$/)
        const { error: eProc } = await supabase.from('processos').insert({
          caixa_id: caixaId,
          numero_documento: numero,
          ano_producao: anoMatch ? Number(anoMatch[1]) : null,
          ano_producao_complemento: anoMatch && anoMatch[2].trim() ? anoMatch[2].trim() : null,
          assunto_processo: l.assunto.trim(),
          setor_origem: setorLinhaEfetivo(l),
          interessado: l.interessado || null,
          data_ultima_movimentacao: l.semDataUltimaMovimentacao ? null : l.dataUltimaMovimentacao.trim() || null,
          sem_data_ultima_movimentacao: l.semDataUltimaMovimentacao,
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
      qc.invalidateQueries({ queryKey: ['setores-disponiveis'] })
      setSetor('')
      setSetorNovo('')
      setQuantidadeDeclarada('')
      setPosseConfirmada(false)
      setIgnorarDivergenciaQtd(false)
      setAvaliadorId('')
      setLinhas([])
      setTextoColado('')
      setDataEntrega(hoje())
      setErro('')
    },
    onError: (e: any) => {
      setErro(e?.message || 'Erro ao enviar a requisição. Tente novamente.')
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
        <h2 className="font-semibold text-gray-900 mb-3">Nova requisição — entrada de caixa</h2>

        <p className="text-xs text-gray-500 mb-3">
          Preencha os dados da caixa física que acabou de chegar. O sistema gera sozinho o código de entrada dela (ex.: <span className="font-mono">CX001</span>) — o número final de arquivamento no Arquivo Geral só é definido depois, quando a avaliação voltar para conferência.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Setor de origem padrão</label>
            <select className="input" value={setor} onChange={e => setSetor(e.target.value)}>
              <option value="">Nenhum (preencher por processo)</option>
              {(setoresExistentes ?? []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__novo__">+ Novo setor…</option>
            </select>
            {setor === '__novo__' && (
              <input
                className="input mt-1.5"
                placeholder="Sigla do setor (ex.: NSP)"
                value={setorNovo}
                onChange={e => setSetorNovo(e.target.value.toUpperCase())}
              />
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              Se a caixa tiver processos de mais de um setor, deixe assim e informe o setor de cada processo na tabela abaixo — este campo só preenche o padrão de linhas novas.
            </p>
          </div>
          <div>
            <label className="label">Quantos processos físicos há na caixa? *</label>
            <input
              type="number"
              min={1}
              className="input"
              placeholder="Ex.: 25"
              value={quantidadeDeclarada}
              onChange={e => { setQuantidadeDeclarada(e.target.value); setIgnorarDivergenciaQtd(false) }}
            />
          </div>
          <div>
            <label className="label">Data da entrega</label>
            <input type="date" className="input" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Avaliador credenciado *</label>
          <select className="input sm:w-1/3" value={avaliadorId} onChange={e => setAvaliadorId(e.target.value)}>
            <option value="">Selecione…</option>
            {(avaliadores ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>

        {(avaliadores ?? []).length === 0 && (
          <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mt-3">
            Nenhum avaliador habilitado ainda. Fale com a Coordenação para liberar alguém como avaliador.
          </p>
        )}

        <label className="flex items-start gap-2 mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={posseConfirmada}
            onChange={e => setPosseConfirmada(e.target.checked)}
          />
          Confirmo que estou de posse da caixa física e já levantei a relação completa dos processos que ela contém.
        </label>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <label className="label">Processos da caixa</label>
          <p className="text-xs text-gray-400 mb-2">
            Arraste aqui a planilha com a relação dos processos (número, ano de produção e o assunto que está na etiqueta), ou cole a lista diretamente. Depois, complete na tabela abaixo o Setor de origem, o Interessado (CDTIV ou PMV) e a última movimentação de cada processo — se não houver despacho registrado, marque a caixinha "Não há data de último despacho" em vez de deixar em branco. Todos esses campos são obrigatórios para enviar a requisição. Uma mesma caixa pode ter processos de setores diferentes: o "Setor de origem padrão" acima só preenche as linhas automaticamente, cada uma pode ser corrigida individualmente.
          </p>

          <div
            className={clsx(
              'flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg py-6 px-4 text-center cursor-pointer transition-colors',
              arrastandoArquivo ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300',
            )}
            onClick={() => arquivoInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setArrastandoArquivo(true) }}
            onDragLeave={() => setArrastandoArquivo(false)}
            onDrop={e => {
              e.preventDefault()
              setArrastandoArquivo(false)
              const file = e.dataTransfer.files?.[0]
              if (file) processarArquivo(file)
            }}
          >
            <UploadCloud size={22} className="text-gray-400" />
            <p className="text-sm text-gray-600">Arraste a planilha aqui, ou clique para escolher o arquivo</p>
            <p className="text-[11px] text-gray-400">.xlsx, .xls ou .csv</p>
            <input
              ref={arquivoInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) processarArquivo(file); e.target.value = '' }}
            />
          </div>
          {erroArquivo && <p className="text-xs text-red-600 mt-1.5">{erroArquivo}</p>}

          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer select-none">ou cole a lista de processos (texto copiado da planilha)</summary>
            <div className="flex gap-2 mt-2">
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
          </details>

          {linhas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="font-medium pb-1 pr-2">Nº Processo *</th>
                    <th className="font-medium pb-1 pr-2">Ano *</th>
                    <th className="font-medium pb-1 pr-2">Assunto (da etiqueta) *</th>
                    <th className="font-medium pb-1 pr-2">Setor de origem *</th>
                    <th className="font-medium pb-1 pr-2">Interessado *</th>
                    <th className="font-medium pb-1 pr-2">Última movimentação *</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const preenchida = l.numero.trim()
                    const incompleta = !!preenchida && !linhaCompleta(l)
                    return (
                      <tr key={i} className={clsx('border-t align-top', incompleta ? 'border-red-100 bg-red-50/50' : 'border-gray-100')}>
                        <td className="py-1 pr-2">
                          <input className="input py-1 text-xs" value={l.numero} onChange={e => atualizarLinha(i, 'numero', e.target.value)} />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className={clsx('input py-1 text-xs w-24', !!preenchida && !l.ano.trim() && 'border-red-300')}
                            value={l.ano}
                            onChange={e => atualizarLinha(i, 'ano', e.target.value)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            className={clsx('input py-1 text-xs', !!preenchida && !l.assunto.trim() && 'border-red-300')}
                            placeholder="Assunto obrigatório…"
                            value={l.assunto}
                            onChange={e => atualizarLinha(i, 'assunto', e.target.value)}
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className={clsx('input py-1 text-xs w-28', !!preenchida && !setorLinhaEfetivo(l) && 'border-red-300')}
                            value={l.setorOrigem}
                            onChange={e => atualizarLinha(i, 'setorOrigem', e.target.value)}
                          >
                            <option value="">Selecione…</option>
                            {(setoresExistentes ?? []).map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                            <option value="__novo__">+ Novo setor…</option>
                          </select>
                          {l.setorOrigem === '__novo__' && (
                            <input
                              className="input py-1 text-xs w-28 mt-1"
                              placeholder="Sigla (ex.: NSP)"
                              value={l.setorOrigemNovo}
                              onChange={e => atualizarLinha(i, 'setorOrigemNovo', e.target.value.toUpperCase())}
                            />
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className={clsx('input py-1 text-xs w-24', !!preenchida && !l.interessado && 'border-red-300')}
                            value={l.interessado}
                            onChange={e => atualizarLinha(i, 'interessado', e.target.value as InteressadoOpcao)}
                          >
                            <option value="">Selecione…</option>
                            <option value="CDTIV">CDTIV</option>
                            <option value="PMV">PMV</option>
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex flex-col gap-1 w-40">
                            <input
                              type="date"
                              className={clsx(
                                'input py-1 text-xs',
                                !!preenchida && !l.semDataUltimaMovimentacao && !l.dataUltimaMovimentacao.trim() && 'border-red-300',
                              )}
                              value={l.dataUltimaMovimentacao}
                              disabled={l.semDataUltimaMovimentacao}
                              onChange={e => atualizarLinha(i, 'dataUltimaMovimentacao', e.target.value)}
                            />
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                              <input
                                type="checkbox"
                                checked={l.semDataUltimaMovimentacao}
                                onChange={e =>
                                  setLinhas(prev =>
                                    prev.map((row, idx) =>
                                      idx === i
                                        ? { ...row, semDataUltimaMovimentacao: e.target.checked, dataUltimaMovimentacao: '' }
                                        : row,
                                    ),
                                  )
                                }
                              />
                              Não há data de último despacho
                            </label>
                          </div>
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
              {linhasIncompletas.length} processo{linhasIncompletas.length === 1 ? '' : 's'} com algum campo obrigatório em branco (destacado{linhasIncompletas.length === 1 ? '' : 's'} acima: ano, assunto, setor de origem, interessado ou última movimentação). Preencha ou remova antes de enviar.
            </p>
          )}

          <button
            className="btn-secondary text-xs mt-3"
            onClick={() => setLinhas(prev => [...prev, linhaVazia(setorEfetivo)])}
          >
            <Plus size={13} /> Adicionar linha em branco
          </button>
        </div>

        {divergeQuantidade && (
          <div className="mt-4 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <PackageSearch size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>
                Você declarou <strong>{quantidadeDeclaradaNum}</strong> processo(s) na caixa, mas a lista abaixo tem <strong>{linhasValidas.length}</strong>. Confira se a caixa foi totalmente esgotada antes de enviar.
              </p>
              <label className="flex items-center gap-1.5 mt-1.5 text-xs">
                <input type="checkbox" checked={ignorarDivergenciaQtd} onChange={e => setIgnorarDivergenciaQtd(e.target.checked)} />
                Enviar mesmo assim
              </label>
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            className="btn-primary text-sm"
            disabled={!podeEnviar || enviar.isPending}
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
                    {r.caixa?.status === 'aguardando_conferencia' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-navy-100 text-navy-700">
                        Aguardando conferência do Protocolo
                      </span>
                    )}
                    {r.caixa?.status === 'arquivada' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700">
                        Arquivada
                      </span>
                    )}
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
