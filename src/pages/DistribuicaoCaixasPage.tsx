// Distribuição de caixas — tela do Protocolo para enviar as caixas aos avaliadores.
//
// Em 3 passos: 1) escolher a planilha · 2) conferir · 3) resultado do envio.
// Foi pensada para quem faz só isso: o sistema lê a planilha, separa o que está
// pronto do que precisa de atenção, explica cada problema em frase simples e só
// envia as caixas prontas. O que ficou de fora não se perde: dá para corrigir e
// enviar depois.
//
// O que é gravado no banco é exatamente o que a tela de Requisições de Avaliação
// já gravava no envio em lote (caixa, processos e requisição) — só mudou a
// forma de conduzir a pessoa e de avisar os problemas.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import clsx from 'clsx'
import { UploadCloud, CheckCircle2, AlertTriangle, XCircle, Send, FileSpreadsheet, ArrowLeft, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { lerPlanilhaEmLotes, type LoteDetectado, type AvisoPlanilha } from '@/lib/parsePlanilhaEmLotes'
import { avisoIgnoraLinha, sugerirAvaliador, textoDoAviso } from '@/lib/distribuicaoCaixas'
import { CepasParaEmitir } from '@/components/CepasParaEmitir'

// Dados devolvidos por `buscar_caixa_por_numero_fisico` quando aquele número
// de caixa já existe no sistema.
interface CaixaExistenteInfo {
  caixa_id: string
  numero_sistema: string
  status: string
  data_entrega: string | null
  avaliador_nome: string | null
}

interface LoteConferencia extends LoteDetectado {
  avaliadorIdSelecionado: string
  duplicado: 'verificando' | CaixaExistenteInfo | null
}

interface Leitura {
  nomeArquivo: string
  aba: string
  totalAbas: number
  avisos: AvisoPlanilha[]
}

interface ErroLeitura {
  titulo: string
  texto: string
  colunasVistas?: string[]
  avisos?: AvisoPlanilha[]
}

interface EnviadaOk {
  numeroFisico: string
  codigoEntrada: string
  avaliadorNome: string
  qtdProcessos: number
}

interface EnvioFalhou {
  numeroFisico: string
  mensagem: string
}

interface ResultadoEnvio {
  enviadas: EnviadaOk[]
  falhas: EnvioFalhou[]
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function dataBr(iso: string | null) {
  return iso ? format(new Date(iso + 'T00:00:00'), 'dd/MM/yyyy') : 'data não registrada'
}

const COLUNAS_ESPERADAS = ['CAIXA', 'PROCESSO', 'ANO', 'DESCRIÇÃO', 'SETOR', 'DATA DESPACHO']

function Passos({ atual }: { atual: 1 | 2 | 3 }) {
  const itens = ['Escolher a planilha', 'Conferir', 'Resultado']
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-label="Passos">
      {itens.map((nome, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const feito = n < atual
        const ativo = n === atual
        return (
          <li
            key={nome}
            aria-current={ativo ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-2.5 rounded-lg border bg-white px-3.5 py-2.5 text-sm',
              ativo ? 'border-teal-600 font-semibold text-gray-900' : 'border-gray-200 text-gray-500',
            )}
          >
            <span
              className={clsx(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                feito ? 'bg-green-600 text-white' : ativo ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500',
              )}
            >
              {feito ? <CheckCircle2 size={16} /> : n}
            </span>
            {nome}
          </li>
        )
      })}
    </ol>
  )
}

export function DistribuicaoCaixasPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [lotes, setLotes] = useState<LoteConferencia[] | null>(null)
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [erroLeitura, setErroLeitura] = useState<ErroLeitura | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [posse, setPosse] = useState(false)
  const [cienteLinhas, setCienteLinhas] = useState(false)
  const [dataEntrega, setDataEntrega] = useState(hoje())
  const [resultado, setResultado] = useState<ResultadoEnvio | null>(null)

  const { data: avaliadores } = useQuery({
    queryKey: ['avaliadores-habilitados'],
    queryFn: async () => {
      const { data } = await supabase.from('usuarios').select('id, nome, email').eq('pode_avaliar_processos', true).order('nome')
      return data ?? []
    },
  })

  const etapa: 1 | 2 | 3 = resultado ? 3 : lotes ? 2 : 1

  // Confere, caixa a caixa, se o número já existe no sistema (para não enviar duas vezes).
  async function verificarDuplicidades(numeros: string[]) {
    await Promise.all(
      numeros.map(async numeroFisico => {
        const { data, error } = await supabase.rpc('buscar_caixa_por_numero_fisico', { p_numero_fisico: numeroFisico })
        const achado: CaixaExistenteInfo | null = !error && Array.isArray(data) && data.length > 0 ? data[0] : null
        setLotes(prev => (prev ? prev.map(l => (l.numeroFisico === numeroFisico ? { ...l, duplicado: achado } : l)) : prev))
      }),
    )
  }

  async function lerArquivo(file: File) {
    setErroLeitura(null)
    setLendo(true)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const nomeAba = wb.SheetNames[0]
      const aba = wb.Sheets[nomeAba]
      if (!aba) {
        setErroLeitura({ titulo: 'A planilha está vazia', texto: 'Não encontrei nenhuma aba com dados neste arquivo.' })
        return
      }
      const inicio = aba['!ref'] ? XLSX.utils.decode_range(aba['!ref']).s.r : 0
      const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, blankrows: true })
      const r = lerPlanilhaEmLotes(linhas, avaliadores ?? [], inicio + 1)

      if (!r.lotes || r.lotes.length === 0) {
        const semTitulos = r.avisos.some(a => a.tipo === 'sem_cabecalho')
        setErroLeitura(
          semTitulos
            ? {
                titulo: 'Não encontrei as colunas CAIXA e PROCESSO',
                texto:
                  'A linha de títulos da planilha precisa ter, no mínimo, as colunas CAIXA e PROCESSO. Confira se os títulos estão escritos assim e tente de novo.',
                colunasVistas: r.colunasVistas,
              }
            : {
                titulo: 'Achei os títulos, mas nenhuma linha estava completa',
                texto: 'Para uma linha ser lida, ela precisa ter o número da caixa e o número do processo. Veja o que encontrei:',
                avisos: r.avisos,
              },
        )
        return
      }

      setLotes(
        r.lotes.map(l => ({ ...l, avaliadorIdSelecionado: l.avaliadorId ?? '', duplicado: 'verificando' as const })),
      )
      setLeitura({ nomeArquivo: file.name, aba: nomeAba, totalAbas: wb.SheetNames.length, avisos: r.avisos })
      setPosse(false)
      setCienteLinhas(false)
      verificarDuplicidades(r.lotes.map(l => l.numeroFisico))
    } catch {
      setErroLeitura({
        titulo: 'Não consegui abrir este arquivo',
        texto: 'Confira se é uma planilha do Excel (.xlsx ou .xls) ou um arquivo .csv e tente de novo.',
      })
    } finally {
      setLendo(false)
    }
  }

  function recomecar() {
    setLotes(null)
    setLeitura(null)
    setResultado(null)
    setErroLeitura(null)
    setPosse(false)
    setCienteLinhas(false)
  }

  function escolherAvaliador(numeroFisico: string, id: string) {
    setLotes(prev => (prev ? prev.map(l => (l.numeroFisico === numeroFisico ? { ...l, avaliadorIdSelecionado: id } : l)) : prev))
  }

  const verificando = (lotes ?? []).some(l => l.duplicado === 'verificando')
  const estaDuplicado = (l: LoteConferencia) => !!l.duplicado && l.duplicado !== 'verificando'
  const duplicados = (lotes ?? []).filter(estaDuplicado)
  const semAvaliador = (lotes ?? []).filter(l => !estaDuplicado(l) && !l.avaliadorIdSelecionado)
  const prontos = (lotes ?? []).filter(l => !estaDuplicado(l) && !!l.avaliadorIdSelecionado)
  const linhasIgnoradas = (leitura?.avisos ?? []).filter(avisoIgnoraLinha)
  const outrosAvisos = (leitura?.avisos ?? []).filter(a => !avisoIgnoraLinha(a))
  const nomeDoAvaliador = (id: string) => (avaliadores ?? []).find(a => a.id === id)?.nome ?? '—'

  const podeEnviar =
    !!lotes && prontos.length > 0 && !verificando && posse && !!dataEntrega && (linhasIgnoradas.length === 0 || cienteLinhas)

  const enviar = useMutation({
    mutationFn: async (): Promise<ResultadoEnvio> => {
      if (!profile || !lotes) return { enviadas: [], falhas: [] }
      const enviadas: EnviadaOk[] = []
      const falhas: EnvioFalhou[] = []

      for (const l of prontos) {
        try {
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

          const { error: eReq } = await supabase.from('requisicoes_avaliacao').insert({
            caixa_id: caixaId,
            avaliador_id: l.avaliadorIdSelecionado,
            criado_por: profile.id,
            data_entrega: dataEntrega,
          })
          if (eReq) throw eReq

          enviadas.push({
            numeroFisico: l.numeroFisico,
            codigoEntrada: String(codigoEntrada),
            avaliadorNome: nomeDoAvaliador(l.avaliadorIdSelecionado),
            qtdProcessos: l.processos.length,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
          falhas.push({
            numeroFisico: l.numeroFisico,
            mensagem: msg || 'erro ao gravar',
          })
        }
      }
      return { enviadas, falhas }
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['requisicoes-avaliacao'] })
      qc.invalidateQueries({ queryKey: ['setores-disponiveis'] })
      const enviadasSet = new Set(r.enviadas.map(e => e.numeroFisico))
      setLotes(prev => {
        const restantes = (prev ?? []).filter(l => !enviadasSet.has(l.numeroFisico))
        return restantes.length > 0 ? restantes : null
      })
      setResultado(r)
    },
    onError: () => {
      setResultado({ enviadas: [], falhas: [{ numeroFisico: '—', mensagem: 'Não consegui falar com o sistema. Confira a internet e tente de novo.' }] })
    },
  })

  function voltarParaConferencia() {
    setResultado(null)
    setPosse(false)
    setCienteLinhas(false)
    const restantes = (lotes ?? []).map(l => ({ ...l, duplicado: 'verificando' as const }))
    setLotes(restantes)
    verificarDuplicidades(restantes.map(l => l.numeroFisico))
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Distribuição de caixas</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Siga os 3 passos. O sistema avisa se algo precisar de ajuste antes de enviar, e nada é enviado sem a sua confirmação.
        </p>
      </div>

      <Passos atual={etapa} />

      {(etapa === 1 || etapa === 3) && <CepasParaEmitir />}

      {/* ---------------- PASSO 1: escolher a planilha ---------------- */}
      {etapa === 1 && (
        <div className="card p-5">
          <div
            onDragOver={e => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={e => {
              e.preventDefault()
              setArrastando(false)
              const f = e.dataTransfer.files?.[0]
              if (f) lerArquivo(f)
            }}
            className={clsx(
              'rounded-xl border-2 border-dashed px-5 py-12 text-center transition-colors',
              arrastando ? 'border-teal-600 bg-teal-100/60' : 'border-teal-500/60 bg-teal-50/60',
            )}
          >
            <UploadCloud size={34} className="mx-auto text-teal-700" />
            <p className="mt-3 text-lg font-semibold text-gray-900">Arraste aqui a sua planilha de caixas</p>
            <p className="mt-1 text-sm text-gray-500">ou clique no botão para escolher o arquivo no computador</p>
            <button className="btn-primary mt-4" onClick={() => inputRef.current?.click()} disabled={lendo}>
              <FileSpreadsheet size={16} /> {lendo ? 'Lendo a planilha…' : 'Escolher planilha'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) lerArquivo(f)
                e.target.value = ''
              }}
            />
          </div>

          {erroLeitura && (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <XCircle size={16} /> {erroLeitura.titulo}
              </p>
              <p className="mt-1 text-sm text-red-800">{erroLeitura.texto}</p>
              {erroLeitura.colunasVistas && erroLeitura.colunasVistas.length > 0 && (
                <p className="mt-2 text-sm text-red-800">
                  Os títulos que encontrei na primeira linha foram:{' '}
                  <span className="font-semibold">{erroLeitura.colunasVistas.join(' · ')}</span>
                </p>
              )}
              {erroLeitura.avisos && erroLeitura.avisos.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-red-800 space-y-0.5">
                  {erroLeitura.avisos.slice(0, 8).map((a, i) => <li key={i}>{textoDoAviso(a)}</li>)}
                  {erroLeitura.avisos.length > 8 && <li>… e mais {erroLeitura.avisos.length - 8}.</li>}
                </ul>
              )}
              <p className="mt-2 text-sm text-red-800">
                Corrija a planilha e arraste de novo. Se for uma lista simples de <strong>uma caixa só</strong> (sem a coluna CAIXA), use a{' '}
                <Link to="/requisicoes-avaliacao" className="underline font-semibold">tela de Requisições de Avaliação</Link>.
              </p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Como preparar a planilha</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>Um arquivo do Excel com uma linha por processo.</li>
                <li>Pode ter várias caixas na mesma planilha.</li>
                <li>O nome do avaliador vai na coluna logo ao lado de CAIXA.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Colunas que o sistema procura</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLUNAS_ESPERADAS.map(c => (
                  <span key={c} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{c}</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">CAIXA e PROCESSO são obrigatórias. A ordem das colunas não importa.</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- PASSO 2: conferir ---------------- */}
      {etapa === 2 && lotes && (
        <div className="space-y-4">
          {leitura && (
            <p className="text-xs text-gray-500">
              Arquivo: <span className="font-medium text-gray-700">{leitura.nomeArquivo}</span>
              {leitura.totalAbas > 1 && <> · li só a primeira aba ("{leitura.aba}"), as demais foram ignoradas</>}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-3xl font-bold text-gray-900 leading-none">{lotes.length}</p>
              <p className="mt-1 text-sm text-gray-600">caixa{lotes.length === 1 ? '' : 's'} encontrada{lotes.length === 1 ? '' : 's'} na planilha</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-3xl font-bold text-green-700 leading-none">{verificando ? '…' : prontos.length}</p>
              <p className="mt-1 text-sm text-green-700">pronta{prontos.length === 1 ? '' : 's'} para enviar</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-3xl font-bold text-amber-700 leading-none">{verificando ? '…' : duplicados.length + semAvaliador.length}</p>
              <p className="mt-1 text-sm text-amber-700">precisa{duplicados.length + semAvaliador.length === 1 ? '' : 'm'} da sua atenção</p>
            </div>
          </div>

          {(linhasIgnoradas.length > 0 || outrosAvisos.length > 0) && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle size={16} /> Atenção com a planilha
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-0.5">
                {[...linhasIgnoradas, ...outrosAvisos].slice(0, 10).map((a, i) => <li key={i}>{textoDoAviso(a)}</li>)}
                {linhasIgnoradas.length + outrosAvisos.length > 10 && (
                  <li>… e mais {linhasIgnoradas.length + outrosAvisos.length - 10} aviso(s).</li>
                )}
              </ul>
              {linhasIgnoradas.length > 0 && (
                <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
                  <input type="checkbox" className="mt-0.5" checked={cienteLinhas} onChange={e => setCienteLinhas(e.target.checked)} />
                  Entendi que {linhasIgnoradas.length === 1 ? 'a linha' : `as ${linhasIgnoradas.length} linhas`} que não {linhasIgnoradas.length === 1 ? 'foi lida' : 'foram lidas'} não {linhasIgnoradas.length === 1 ? 'será enviada' : 'serão enviadas'}. Vou corrigir a planilha depois.
                </label>
              )}
            </div>
          )}

          {(duplicados.length > 0 || semAvaliador.length > 0) && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                Precisam da sua atenção ({duplicados.length + semAvaliador.length})
              </h2>
              <div className="space-y-2">
                {duplicados.map(l => {
                  const info = l.duplicado as CaixaExistenteInfo
                  return (
                    <div key={l.numeroFisico} className="flex gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3">
                      <XCircle size={20} className="mt-0.5 shrink-0 text-red-600" />
                      <div className="text-sm">
                        <p className="font-semibold text-gray-900">Caixa {l.numeroFisico} · {l.processos.length} processo{l.processos.length === 1 ? '' : 's'}</p>
                        <p className="mt-0.5 text-gray-700">
                          Esta caixa <strong>já foi enviada</strong> em {dataBr(info.data_entrega)} (código {info.numero_sistema}
                          {info.avaliador_nome ? `, para ${info.avaliador_nome}` : ''}). Para não duplicar,{' '}
                          <strong>ela não será enviada de novo</strong>. Confira se o número da caixa na planilha está certo.
                        </p>
                      </div>
                    </div>
                  )
                })}
                {semAvaliador.map(l => {
                  const sugestao = l.avaliadorBruto ? sugerirAvaliador(l.avaliadorBruto, avaliadores ?? []) : null
                  const motivo =
                    l.statusMatch === 'em_branco'
                      ? 'A planilha não informa o avaliador desta caixa.'
                      : l.statusMatch === 'ambiguo'
                        ? `“${l.avaliadorBruto}” combina com mais de um avaliador.`
                        : `Não encontrei o avaliador “${l.avaliadorBruto}” no sistema.`
                  return (
                    <div key={l.numeroFisico} className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-3 text-sm">
                          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                          <div>
                            <p className="font-semibold text-gray-900">Caixa {l.numeroFisico} · {l.processos.length} processo{l.processos.length === 1 ? '' : 's'}</p>
                            <p className="mt-0.5 text-gray-700">{motivo} Escolha o avaliador na lista — ou corrija o nome na planilha e arraste de novo.</p>
                          </div>
                        </div>
                        <select
                          aria-label={`Avaliador da caixa ${l.numeroFisico}`}
                          className="input w-56 text-sm border-amber-300"
                          value={l.avaliadorIdSelecionado}
                          onChange={e => escolherAvaliador(l.numeroFisico, e.target.value)}
                        >
                          <option value="">Escolher avaliador…</option>
                          {(avaliadores ?? []).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </select>
                      </div>
                      {sugestao && (
                        <p className="mt-2 pl-8 text-sm text-gray-700">
                          Você quis dizer <strong>{sugestao.nome}</strong>?{' '}
                          <button className="font-semibold text-teal-700 underline" onClick={() => escolherAvaliador(l.numeroFisico, sugestao.id)}>
                            Sim, usar este
                          </button>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {lotes.some(l => l.duplicado === 'verificando') && (
            <p className="text-sm text-gray-500">Verificando se alguma caixa já foi enviada antes…</p>
          )}

          {prontos.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Prontas para enviar ({prontos.length})</h2>
              <div className="space-y-2">
                {prontos.map(l => {
                  const semAno = l.processos.filter(p => !/^\d{4}/.test(p.ano.trim())).length
                  const semAssunto = l.processos.filter(p => !p.assunto.trim()).length
                  return (
                    <div key={l.numeroFisico} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                      <div className="flex gap-3 text-sm">
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900">Caixa {l.numeroFisico} · {l.processos.length} processo{l.processos.length === 1 ? '' : 's'}</p>
                          <p className="mt-0.5 text-gray-600">
                            Avaliador: {nomeDoAvaliador(l.avaliadorIdSelecionado)}
                            {l.setores.length > 0 && <> · Setores: {l.setores.join(', ')}</>}
                          </p>
                          {(semAno > 0 || semAssunto > 0) && (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
                              <Info size={13} className="mt-0.5 shrink-0" />
                              {[semAno > 0 && `${semAno} processo${semAno === 1 ? '' : 's'} sem ano`, semAssunto > 0 && `${semAssunto} sem assunto`].filter(Boolean).join(' · ')}
                              {' '}— a caixa pode ser enviada assim, mas o avaliador verá esses campos vazios.
                            </p>
                          )}
                          <details className="mt-1.5">
                            <summary className="cursor-pointer select-none text-xs text-gray-500">ver processos desta caixa</summary>
                            <div className="mt-1.5 overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-gray-400">
                                    <th className="pb-1 pr-2 font-medium">Nº Processo</th>
                                    <th className="pb-1 pr-2 font-medium">Ano</th>
                                    <th className="pb-1 pr-2 font-medium">Assunto</th>
                                    <th className="pb-1 pr-2 font-medium">Setor</th>
                                    <th className="pb-1 pr-2 font-medium">Data despacho</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {l.processos.map((p, i) => (
                                    <tr key={i} className="border-t border-gray-100">
                                      <td className="py-1 pr-2">{p.numero}</td>
                                      <td className="py-1 pr-2">{p.ano || '—'}</td>
                                      <td className="py-1 pr-2">{p.assunto || '—'}</td>
                                      <td className="py-1 pr-2">{p.setorOrigem || '—'}</td>
                                      <td className="py-1 pr-2">{p.dataDespacho ? dataBr(p.dataDespacho) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        </div>
                        {l.avaliadorId && l.statusMatch === 'ok' ? null : (
                          <select
                            aria-label={`Trocar o avaliador da caixa ${l.numeroFisico}`}
                            className="input h-9 w-48 self-start text-xs"
                            value={l.avaliadorIdSelecionado}
                            onChange={e => escolherAvaliador(l.numeroFisico, e.target.value)}
                          >
                            {(avaliadores ?? []).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <div className="card p-4 space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" className="mt-0.5" checked={posse} onChange={e => setPosse(e.target.checked)} />
              Confirmo que tenho em mãos as caixas físicas que vou enviar agora e que a lista de processos de cada uma está completa.
            </label>
            <div>
              <label className="label" htmlFor="data-entrega">Data da entrega (vale para todas as caixas enviadas agora)</label>
              <input id="data-entrega" type="date" className="input sm:w-56" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
            <button className="btn-primary" disabled={!podeEnviar || enviar.isPending} onClick={() => enviar.mutate()}>
              <Send size={15} /> {enviar.isPending ? 'Enviando…' : `Enviar ${prontos.length === 1 ? 'a caixa pronta' : `as ${prontos.length} caixas prontas`}`}
            </button>
            <button className="btn-secondary" onClick={recomecar} disabled={enviar.isPending}>
              <ArrowLeft size={15} /> Voltar e trocar a planilha
            </button>
            {duplicados.length + semAvaliador.length > 0 && (
              <span className="text-sm text-gray-500">
                {duplicados.length + semAvaliador.length === 1 ? 'A caixa que precisa' : `As ${duplicados.length + semAvaliador.length} caixas que precisam`} de atenção ficam de fora, e nada se perde: você corrige e envia depois.
              </span>
            )}
          </div>
          {!podeEnviar && !enviar.isPending && prontos.length > 0 && (
            <p className="text-xs text-gray-500">
              Para liberar o envio: {[
                !posse && 'marque a confirmação das caixas físicas',
                linhasIgnoradas.length > 0 && !cienteLinhas && 'marque a ciência das linhas não lidas',
                verificando && 'aguarde a verificação das caixas',
              ].filter(Boolean).join(' · ') || 'confira a data da entrega'}.
            </p>
          )}
        </div>
      )}

      {/* ---------------- PASSO 3: resultado ---------------- */}
      {etapa === 3 && resultado && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            {resultado.enviadas.length > 0 ? (
              <>
                <CheckCircle2 size={44} className="mx-auto text-green-600" />
                <p className="mt-2 text-xl font-bold text-gray-900">
                  {resultado.enviadas.length === 1 ? '1 caixa enviada ao avaliador' : `${resultado.enviadas.length} caixas enviadas aos avaliadores`}
                </p>
                <p className="mt-1 text-sm text-gray-500">Cada avaliador já vê os processos na tela dele. Falta só emitir a CEPA de cada caixa (veja acima).</p>
              </>
            ) : (
              <>
                <AlertTriangle size={44} className="mx-auto text-amber-600" />
                <p className="mt-2 text-xl font-bold text-gray-900">Nenhuma caixa foi enviada</p>
              </>
            )}
          </div>

          {resultado.enviadas.length > 0 && (
            <div className="space-y-2">
              {resultado.enviadas.map(e => (
                <div key={e.numeroFisico} className="flex gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-600" />
                  <div>
                    <p className="font-semibold text-gray-900">Caixa {e.numeroFisico} → código {e.codigoEntrada}</p>
                    <p className="text-gray-600">{e.avaliadorNome} · {e.qtdProcessos} processo{e.qtdProcessos === 1 ? '' : 's'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resultado.falhas.length > 0 && (
            <div className="space-y-2">
              {resultado.falhas.map(f => (
                <div key={f.numeroFisico} role="alert" className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
                  <XCircle size={20} className="mt-0.5 shrink-0 text-red-600" />
                  <div>
                    <p className="font-semibold text-gray-900">Caixa {f.numeroFisico}: o envio parou no meio</p>
                    <p className="mt-0.5 text-gray-700">
                      Não tente enviar de novo antes de avisar o Coordenador: parte dos dados pode já ter sido gravada.
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Detalhe técnico: {f.mensagem}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(lotes ?? []).length > 0 && (
            <p className="text-sm text-gray-600">
              Ainda {(lotes ?? []).length === 1 ? 'resta 1 caixa' : `restam ${(lotes ?? []).length} caixas`} da planilha que não {(lotes ?? []).length === 1 ? 'foi enviada' : 'foram enviadas'}.
            </p>
          )}

          <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4">
            {(lotes ?? []).length > 0 && (
              <button className="btn-primary" onClick={voltarParaConferencia}>
                <ArrowLeft size={15} /> Voltar e resolver as que faltam
              </button>
            )}
            <button className={(lotes ?? []).length > 0 ? 'btn-secondary' : 'btn-primary'} onClick={recomecar}>
              <UploadCloud size={15} /> Enviar outra planilha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
