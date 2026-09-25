import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, X, Plus, ClipboardPaste, UploadCloud, PackageSearch, FileSignature } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import type { RequisicaoAvaliacao } from '@/lib/database.types'
import { parsePlanilhaEmLotes, type LoteDetectado } from '@/lib/parsePlanilhaEmLotes'
import { declaracaoCepa, gerarCepaPdf } from '@/lib/documentosCepaCrpa'
import clsx from 'clsx'

type RequisicaoLista = RequisicaoAvaliacao & {
  caixa: { numero: string; numero_fisico: string | null; status: string; quantidade_declarada: number | null } | null
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

// Dados devolvidos pela função `buscar_caixa_por_numero_fisico` (Fase
// 20) quando aquele número físico de caixa já existe no sistema — ver
// migracao_fase20_numero_fisico_caixa.sql.
interface CaixaExistenteInfo {
  caixa_id: string
  numero_sistema: string
  status: string
  data_entrega: string | null
  avaliador_nome: string | null
}

// Um lote detectado (ver parsePlanilhaEmLotes), acrescido do que só a
// tela sabe: qual avaliador foi efetivamente selecionado (pode ter
// sido corrigido manualmente) e se aquele número físico de caixa já
// existe no sistema (verificado contra o Supabase assim que o arquivo
// é lido, antes de qualquer envio).
interface LoteConferencia extends LoteDetectado {
  avaliadorIdSelecionado: string
  duplicado: 'verificando' | CaixaExistenteInfo | null
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

// Lê a planilha (.xlsx/.xls/.csv) pela via "simples", de sempre: número
// do processo, ano de produção e assunto da etiqueta, nessa ordem fixa
// de colunas — usada quando a planilha arrastada não tem uma coluna
// "CAIXA" reconhecível (ou seja, não é a Planilha Mãe do Protocolo, e
// sim uma lista avulsa de uma única caixa). Se a primeira linha
// parecer um cabeçalho (a coluna do "ano" não é um ano de verdade),
// ela é descartada.
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

// ------------------------------------------------------------------
// CEPA — Confirmação de Envio de Processos para Avaliação (Fase 21)
// ------------------------------------------------------------------

// Uma caixa (de qualquer um dos dois fluxos de envio) cuja requisição
// já foi enviada mas ainda não tem CEPA emitida. Diferente da versão
// anterior desta tela, esta lista é sempre recalculada a partir do
// que está de fato salvo no banco (ver `pendentesCepa` abaixo) — não
// depende de nada guardado só na memória do navegador. Assim, se o
// Protocolo enviar uma caixa e sair da tela (ou atualizar a página)
// antes de emitir a CEPA, ela continua aparecendo aqui na próxima
// visita, em vez de sumir e travar o avaliador para sempre.
interface PendenteCepa {
  requisicaoId: string
  caixaId: string
  caixaNumero: string
  avaliadorId: string
  avaliadorNome: string
  qtdProcessos: number
  dataEntrega: string
  emitindo: boolean
  erro: string
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

  // Estado exclusivo do fluxo em lote (Fase 20): quando uma planilha
  // com coluna "CAIXA" é arrastada, `lotes` deixa de ser `null` e a
  // tela troca o formulário de caixa única pela tela de conferência
  // dos lotes detectados. Nada é enviado ao Supabase enquanto o
  // usuário não confirmar explicitamente no botão "Enviar".
  const [lotes, setLotes] = useState<LoteConferencia[] | null>(null)
  const [posseConfirmadaLote, setPosseConfirmadaLote] = useState(false)
  const [erroLote, setErroLote] = useState('')

  // Estado só de interface para o botão "Emitir CEPA" de cada item da
  // lista (ver `pendentesCepa` mais abaixo): qual está emitindo agora
  // e qual deu erro. Pode se perder numa atualização de página sem
  // problema nenhum — a lista em si (quem ainda precisa de CEPA) vem
  // sempre do banco, não daqui.
  const [emitindoIds, setEmitindoIds] = useState<Record<string, boolean>>({})
  const [errosCepa, setErrosCepa] = useState<Record<string, string>>({})

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
        .select('*, caixa:caixa_id(numero,numero_fisico,status,quantidade_declarada), avaliador:avaliador_id(nome), criador:criado_por(nome)')
        .order('created_at', { ascending: false })
      return (data ?? []) as RequisicaoLista[]
    },
  })

  // Quais requisições já têm CEPA emitida — Fase 21. Consultado sempre
  // do banco (nunca de estado local) para que "quem ainda está
  // aguardando emissão da CEPA" reflita a realidade mesmo depois de
  // atualizar a página, trocar de tela ou de sessão.
  const { data: idsComCepa } = useQuery({
    queryKey: ['cepas-por-requisicao'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cepas').select('requisicao_avaliacao_id')
      if (error) throw error
      return new Set((data ?? []).map(c => c.requisicao_avaliacao_id as string))
    },
  })

  // Lista de caixas enviadas (requisição com status "pendente") que
  // ainda não têm CEPA — é isso que aparece no card "Emitir CEPA"
  // logo abaixo. Como vem inteira do banco (requisicoes + idsComCepa),
  // nunca "some" sozinha: some só quando a CEPA é realmente emitida.
  const pendentesCepa: PendenteCepa[] = useMemo(() => {
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
        emitindo: !!emitindoIds[r.id],
        erro: errosCepa[r.id] ?? '',
      }))
      .reverse()
  }, [requisicoes, idsComCepa, emitindoIds, errosCepa])

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

  // Confere, um a um, se cada número físico de caixa detectado já
  // existe no sistema — chamando a função `buscar_caixa_por_numero_fisico`
  // (Fase 20). Atualiza cada lote independentemente, assim que a sua
  // própria checagem responder, para não travar a tela toda esperando
  // a checagem de todas as caixas.
  async function verificarDuplicidades(numerosFisicos: string[]) {
    for (const numeroFisico of numerosFisicos) {
      const { data, error } = await supabase.rpc('buscar_caixa_por_numero_fisico', { p_numero_fisico: numeroFisico })
      const achado: CaixaExistenteInfo | null = !error && Array.isArray(data) && data.length > 0 ? data[0] : null
      setLotes(prev => (prev ? prev.map(l => (l.numeroFisico === numeroFisico ? { ...l, duplicado: achado } : l)) : prev))
    }
  }

  function definirAvaliadorLote(numeroFisico: string, novoAvaliadorId: string) {
    setLotes(prev => (prev ? prev.map(l => (l.numeroFisico === numeroFisico ? { ...l, avaliadorIdSelecionado: novoAvaliadorId } : l)) : prev))
  }

  // Lê o arquivo arrastado e decide qual dos dois fluxos usar:
  //  - se a planilha tiver uma coluna "CAIXA" reconhecível (a
  //    "Planilha Mãe" real do Protocolo, com várias caixas físicas
  //    misturadas), entra no fluxo em lote — tela de conferência,
  //    nada é enviado sem confirmação;
  //  - senão (uma lista avulsa, de uma caixa só — o uso de sempre),
  //    segue exatamente como já funcionava: as linhas lidas vão direto
  //    para a tabela editável abaixo.
  async function processarArquivo(file: File) {
    setErroArquivo('')
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const primeiraAba = workbook.Sheets[workbook.SheetNames[0]]
      const linhasBrutas = XLSX.utils.sheet_to_json<unknown[]>(primeiraAba, { header: 1, blankrows: false })

      const gruposDetectados = parsePlanilhaEmLotes(linhasBrutas, avaliadores ?? [])

      if (gruposDetectados && gruposDetectados.length > 0) {
        const lotesIniciais: LoteConferencia[] = gruposDetectados.map(g => ({
          ...g,
          avaliadorIdSelecionado: g.avaliadorId ?? '',
          duplicado: 'verificando',
        }))
        setLotes(lotesIniciais)
        setPosseConfirmadaLote(false)
        setErroLote('')
        verificarDuplicidades(lotesIniciais.map(l => l.numeroFisico))
        return
      }

      // Planilha sem coluna "CAIXA" reconhecível: caminho de sempre.
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

      const { data: novaRequisicao, error: eReq } = await supabase
        .from('requisicoes_avaliacao')
        .insert({
          caixa_id: caixaId,
          avaliador_id: avaliadorId,
          criado_por: profile.id,
          data_entrega: dataEntrega,
        })
        .select('id')
        .single()
      if (eReq) throw eReq

      return {
        requisicaoId: novaRequisicao!.id,
        caixaId,
        caixaNumero: codigoEntrada as string,
        avaliadorId,
        qtdProcessos: linhasValidas.length,
        dataEntrega,
      }
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

  // Classificação dos lotes detectados, usada tanto para desenhar a
  // tela de conferência quanto para decidir o que o botão "Enviar" faz:
  //  - `lotesDuplicados`: número físico já existe no sistema — fica
  //    retido, com o aviso explícito pedido pelo Sérgio; nunca é
  //    enviado nem por engano.
  //  - `lotesSemAvaliador`: ainda não têm avaliador escolhido (nem
  //    reconhecido automaticamente, nem selecionado à mão) — ficam
  //    retidos até alguém escolher, sem travar os demais.
  //  - `lotesProntos`: podem ser enviados agora.
  const aindaVerificandoDuplicidade = (lotes ?? []).some(l => l.duplicado === 'verificando')
  const lotesDuplicados = (lotes ?? []).filter(l => l.duplicado && l.duplicado !== 'verificando')
  const lotesSemAvaliador = (lotes ?? []).filter(l => !l.avaliadorIdSelecionado && !(l.duplicado && l.duplicado !== 'verificando'))
  const lotesProntos = (lotes ?? []).filter(l => !!l.avaliadorIdSelecionado && !(l.duplicado && l.duplicado !== 'verificando'))

  const podeEnviarLotes = !!lotes && posseConfirmadaLote && !aindaVerificandoDuplicidade && lotesProntos.length > 0

  interface ResumoEnvioLote {
    numeroFisico: string
    ok: boolean
    requisicaoId: string
    caixaId: string
    avaliadorId: string
    qtdProcessos: number
    dataEntrega: string
  }

  const enviarLotes = useMutation({
    mutationFn: async () => {
      if (!profile || !lotes) return [] as ResumoEnvioLote[]
      const resumo: ResumoEnvioLote[] = []

      for (const l of lotes) {
        const bloqueado = (l.duplicado && l.duplicado !== 'verificando') || !l.avaliadorIdSelecionado
        if (bloqueado) continue

        const { data: codigoEntrada, error: eCodigo } = await supabase.rpc('gerar_codigo_entrada_caixa')
        if (eCodigo) throw eCodigo

        const setoresDoLote = new Set(l.processos.map(p => p.setorOrigem.trim()).filter(Boolean))
        if (setoresDoLote.size > 0) {
          const { error: eSetores } = await supabase
            .from('setores_cdtiv')
            .upsert([...setoresDoLote].map(sigla => ({ sigla })), { onConflict: 'sigla', ignoreDuplicates: true })
          if (eSetores) throw eSetores
        }
        const setorPredominante = setoresDoLote.size === 1 ? [...setoresDoLote][0] : null

        const { data: novaCaixa, error: eCaixa } = await supabase
          .from('caixas')
          .insert({
            numero: codigoEntrada,
            numero_fisico: l.numeroFisico,
            setor: setorPredominante,
            status: 'em_avaliacao',
            quantidade_declarada: l.processos.length,
          })
          .select('id')
          .single()
        if (eCaixa) throw eCaixa
        const caixaId = novaCaixa!.id

        for (const p of l.processos) {
          const anoMatch = p.ano.trim().match(/^(\d{4})(.*)$/)
          const { error: eProc } = await supabase.from('processos').insert({
            caixa_id: caixaId,
            numero_documento: p.numero.trim(),
            ano_producao: anoMatch ? Number(anoMatch[1]) : null,
            ano_producao_complemento: anoMatch && anoMatch[2].trim() ? anoMatch[2].trim() : null,
            assunto_processo: p.assunto.trim(),
            setor_origem: p.setorOrigem.trim() || null,
            interessado: null,
            data_ultima_movimentacao: p.dataDespacho || null,
            sem_data_ultima_movimentacao: !p.dataDespacho,
          })
          if (eProc) throw eProc
        }

        const { data: novaRequisicao, error: eReq } = await supabase
          .from('requisicoes_avaliacao')
          .insert({
            caixa_id: caixaId,
            avaliador_id: l.avaliadorIdSelecionado,
            criado_por: profile.id,
            data_entrega: dataEntrega,
          })
          .select('id')
          .single()
        if (eReq) throw eReq

        resumo.push({
          numeroFisico: l.numeroFisico,
          ok: true,
          requisicaoId: novaRequisicao!.id,
          caixaId,
          avaliadorId: l.avaliadorIdSelecionado as string,
          qtdProcessos: l.processos.length,
          dataEntrega,
        })
      }
      return resumo
    },
    onSuccess: resumo => {
      qc.invalidateQueries({ queryKey: ['requisicoes-avaliacao'] })
      qc.invalidateQueries({ queryKey: ['setores-disponiveis'] })
      const enviados = new Set(resumo.map(r => r.numeroFisico))
      setLotes(prev => {
        const restantes = (prev ?? []).filter(l => !enviados.has(l.numeroFisico))
        return restantes.length > 0 ? restantes : null
      })
      if (enviados.size > 0) setErroLote('')
    },
    onError: (e: any) => {
      setErroLote(e?.message || 'Erro ao enviar as caixas. Tente novamente.')
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

  // ------------------------------------------------------------------
  // Emissão da CEPA (Fase 21) — o Protocolo confirma e o sistema grava
  // o documento (ganhando o número sequencial pelo gatilho do banco) e
  // já baixa o PDF na hora.
  // ------------------------------------------------------------------
  const emitirCepa = useMutation({
    mutationFn: async (item: PendenteCepa) => {
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
    onMutate: (item: PendenteCepa) => {
      setEmitindoIds(prev => ({ ...prev, [item.requisicaoId]: true }))
      setErrosCepa(prev => ({ ...prev, [item.requisicaoId]: '' }))
    },
    onSuccess: ({ item, declaracao, numeroSequencial, ano }) => {
      gerarCepaPdf({
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
      setEmitindoIds(prev => ({ ...prev, [item.requisicaoId]: false }))
      // A CEPA já está gravada no banco — atualiza a lista local na hora
      // (sem esperar a próxima consulta) e confirma com o servidor logo
      // em seguida, para o item sumir do "aguardando emissão" já nesta
      // tela e em qualquer outra aberta (Minhas Atribuições do avaliador).
      qc.setQueryData<Set<string>>(['cepas-por-requisicao'], prev => {
        const atualizado = new Set(prev ?? [])
        atualizado.add(item.requisicaoId)
        return atualizado
      })
      qc.invalidateQueries({ queryKey: ['cepas-por-requisicao'] })
      qc.invalidateQueries({ queryKey: ['cepas-crpas'] })
    },
    onError: (e: any, item: PendenteCepa) => {
      setEmitindoIds(prev => ({ ...prev, [item.requisicaoId]: false }))
      setErrosCepa(prev => ({ ...prev, [item.requisicaoId]: e?.message || 'Erro ao emitir a CEPA. Tente novamente.' }))
    },
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Requisições de Avaliação</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Cadastre os processos de uma caixa que acabou de chegar e envie para um avaliador habilitado.
        </p>
      </div>

      {pendentesCepa.length > 0 && (
        <div className="card p-5 border-2 border-teal-200 bg-teal-50/40">
          <div className="flex items-start gap-3 mb-3">
            <FileSignature className="text-teal-700 mt-0.5" size={20} />
            <div>
              <h2 className="font-semibold text-gray-900">
                Emitir CEPA — Confirmação de Envio de Processos para Avaliação
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {pendentesCepa.length === 1 ? 'Esta caixa foi enviada' : 'Estas caixas foram enviadas'} e ainda{' '}
                {pendentesCepa.length === 1 ? 'aguarda' : 'aguardam'} a emissão da CEPA — o avaliador só consegue
                confirmar o recebimento depois disso. Emita a CEPA de cada uma abaixo; o documento é assinado
                eletronicamente em seu nome, baixado na hora, e fica disponível depois em "CEPAs e CRPAs".
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {pendentesCepa.map(item => (
              <div
                key={item.requisicaoId}
                className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex-wrap"
              >
                <div className="text-sm">
                  <span className="font-semibold text-gray-900">Caixa {item.caixaNumero}</span>
                  <span className="text-gray-500"> — {item.avaliadorNome} — {item.qtdProcessos} processo(s)</span>
                  {item.erro && <p className="text-red-600 text-xs mt-0.5">{item.erro}</p>}
                </div>

                <button
                  onClick={() => emitirCepa.mutate(item)}
                  disabled={item.emitindo}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-full px-3 py-1.5"
                >
                  <FileSignature size={13} />
                  {item.emitindo ? 'Emitindo…' : 'Emitir CEPA'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Nova requisição — entrada de caixa</h2>

        <p className="text-xs text-gray-500 mb-3">
          Preencha os dados da caixa física que acabou de chegar. O sistema gera sozinho o código de entrada dela (ex.: <span className="font-mono">CX001</span>) — o número final de arquivamento no Arquivo Geral só é definido depois, quando a avaliação voltar para conferência.
        </p>

        {lotes ? (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Conferência do lote — {lotes.length} caixa{lotes.length === 1 ? '' : 's'} física{lotes.length === 1 ? '' : 's'} detectada{lotes.length === 1 ? '' : 's'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Essa planilha reúne mais de uma caixa física. Confira o avaliador de cada uma abaixo — nada é gravado até você clicar em "Enviar".
                </p>
              </div>
              <button
                className="btn-secondary text-xs"
                onClick={() => { setLotes(null); setPosseConfirmadaLote(false); setErroLote('') }}
              >
                Cancelar e recomeçar
              </button>
            </div>

            <div className="space-y-2.5">
              {lotes.map(l => {
                const bloqueadoPorDuplicidade = !!l.duplicado && l.duplicado !== 'verificando'
                const precisaAvaliador = !l.avaliadorIdSelecionado
                const duplicadoInfo = bloqueadoPorDuplicidade ? (l.duplicado as CaixaExistenteInfo) : null
                return (
                  <div
                    key={l.numeroFisico}
                    className={clsx(
                      'border rounded-lg px-3.5 py-3',
                      bloqueadoPorDuplicidade ? 'border-red-200 bg-red-50/60' : precisaAvaliador ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100 bg-gray-50/40',
                    )}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-gray-900 text-sm">Caixa física {l.numeroFisico}</span>
                        <span className="text-xs text-gray-500">{l.processos.length} processo{l.processos.length === 1 ? '' : 's'}</span>
                        {l.setores.length > 0 && (
                          <span className="text-[11px] text-gray-400">setores: {l.setores.join(', ')}</span>
                        )}
                      </div>

                      {!bloqueadoPorDuplicidade && (
                        l.avaliadorId && l.statusMatch === 'ok' ? (
                          <span className="text-xs text-teal-700 bg-teal-50 rounded-full px-2.5 py-1">
                            Avaliador: {(avaliadores ?? []).find(a => a.id === l.avaliadorId)?.nome}
                          </span>
                        ) : (
                          <select
                            className={clsx('input py-1 text-xs', precisaAvaliador && 'border-amber-300')}
                            value={l.avaliadorIdSelecionado}
                            onChange={e => definirAvaliadorLote(l.numeroFisico, e.target.value)}
                          >
                            <option value="">
                              {l.avaliadorBruto ? `"${l.avaliadorBruto}" não reconhecido — selecione…` : 'Avaliador não informado — selecione…'}
                            </option>
                            {(avaliadores ?? []).map(a => (
                              <option key={a.id} value={a.id}>{a.nome}</option>
                            ))}
                          </select>
                        )
                      )}
                    </div>

                    {l.duplicado === 'verificando' && (
                      <p className="text-xs text-gray-400 mt-2">Verificando se esta caixa já foi enviada antes…</p>
                    )}
                    {duplicadoInfo && (
                      <p className="text-xs text-red-700 mt-2">
                        ⚠️ Atenção: a caixa física nº {l.numeroFisico} já consta como encaminhada em{' '}
                        {duplicadoInfo.data_entrega
                          ? format(new Date(duplicadoInfo.data_entrega + 'T00:00:00'), 'dd/MM/yyyy')
                          : 'data não registrada'}{' '}
                        (código {duplicadoInfo.numero_sistema}
                        {duplicadoInfo.avaliador_nome ? `, para ${duplicadoInfo.avaliador_nome}` : ''}). Favor revisar o seu lançamento — esta caixa não será enviada.
                      </p>
                    )}

                    <details className="mt-2">
                      <summary className="text-[11px] text-gray-400 cursor-pointer select-none">ver processos desta caixa</summary>
                      <div className="mt-1.5 overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="font-medium pb-1 pr-2">Nº Processo</th>
                              <th className="font-medium pb-1 pr-2">Ano</th>
                              <th className="font-medium pb-1 pr-2">Assunto</th>
                              <th className="font-medium pb-1 pr-2">Setor</th>
                              <th className="font-medium pb-1 pr-2">Data despacho</th>
                            </tr>
                          </thead>
                          <tbody>
                            {l.processos.map((p, idx) => (
                              <tr key={idx} className="border-t border-gray-100">
                                <td className="py-1 pr-2">{p.numero}</td>
                                <td className="py-1 pr-2">{p.ano}</td>
                                <td className="py-1 pr-2">{p.assunto}</td>
                                <td className="py-1 pr-2">{p.setorOrigem || '—'}</td>
                                <td className="py-1 pr-2">{p.dataDespacho ? format(new Date(p.dataDespacho + 'T00:00:00'), 'dd/MM/yyyy') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>

            <label className="flex items-start gap-2 mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={posseConfirmadaLote}
                onChange={e => setPosseConfirmadaLote(e.target.checked)}
              />
              Confirmo que o Protocolo está de posse de todas as caixas físicas listadas acima e que a relação de processos de cada uma está completa.
            </label>

            <div className="mt-4">
              <label className="label">Data da entrega (aplicada a todas as caixas enviadas agora)</label>
              <input type="date" className="input sm:w-1/3" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
              <button
                className="btn-primary text-sm"
                disabled={!podeEnviarLotes || enviarLotes.isPending}
                onClick={() => enviarLotes.mutate()}
              >
                <Send size={14} /> {enviarLotes.isPending ? 'Enviando…' : `Enviar ${lotesProntos.length} caixa${lotesProntos.length === 1 ? '' : 's'}`}
              </button>
              {lotesDuplicados.length > 0 && (
                <span className="text-xs text-red-600">{lotesDuplicados.length} caixa(s) retida(s) por duplicidade.</span>
              )}
              {lotesSemAvaliador.length > 0 && (
                <span className="text-xs text-amber-600">{lotesSemAvaliador.length} caixa(s) aguardando seleção de avaliador.</span>
              )}
              {erroLote && <p className="text-sm text-red-600">{erroLote}</p>}
            </div>
          </div>
        ) : (
          <>
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
                Arraste aqui a planilha com a relação dos processos (número, ano de produção e o assunto que está na etiqueta), ou cole a lista diretamente. Se a planilha arrastada for a Planilha Mãe do Protocolo (com a coluna "CAIXA" reunindo várias caixas físicas de uma vez), o sistema reconhece isso sozinho e abre a tela de conferência em lote antes de enviar qualquer coisa. Depois, complete na tabela abaixo o Setor de origem, o Interessado (CDTIV ou PMV) e a última movimentação de cada processo — se não houver despacho registrado, marque a caixinha "Não há data de último despacho" em vez de deixar em branco. Todos esses campos são obrigatórios para enviar a requisição. Uma mesma caixa pode ter processos de setores diferentes: o "Setor de origem padrão" acima só preenche as linhas automaticamente, cada uma pode ser corrigida individualmente.
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
          </>
        )}
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
