export type Papel = 'coordenador' | 'coordenador_substituto' | 'responsavel_pilar' | 'membro' | 'apoio_tecnico'
export type StatusUsuario = 'ativo' | 'convite_pendente'
export type Relevancia = 'alta' | 'media' | 'baixa'
export type StatusDemanda = 'pendente' | 'em_andamento' | 'concluida'
export type StatusRelatorio = 'rascunho' | 'enviado' | 'atrasado'
export type StatusTTD = 'vigente' | 'proposta' | 'descontinuado'
export type ImpactoRisco = 'alto' | 'medio' | 'baixo'
export type ProbabilidadeRisco = 'alta' | 'media' | 'baixa'
export type StatusProposta = 'em_analise' | 'aprovada' | 'rejeitada'
export type TipoReuniaoAta = 'mensal_consolidada' | 'quinzenal_frente' | 'checkpoint_trimestral'
export type StatusConsultoriaMemorial = 'a_contratar' | 'contratado' | 'concluido'
export type StatusLicitacaoDigitalizacao =
  | 'a_iniciar' | 'tr_em_validacao' | 'licitacao_aberta' | 'contratado' | 'em_execucao'
export type TipoMuralEvento =
  | 'atividade_concluida' | 'ata_registrada' | 'indicador_lancado' | 'demanda_concluida' | 'fase_concluida'

export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  pilar_id: string | null
  status: StatusUsuario
  acesso_protocolo_geral: boolean
}

export interface Pilar {
  id: string
  nome: string
  prazo_meses: number
  responsavel_id: string | null
  nome_normalizado: string | null
  responsavel?: Usuario
}

export interface Fase {
  id: string
  pilar_id: string
  nome: string
  ordem: number
  percentual_conclusao: number
}

export interface Demanda {
  id: string
  titulo: string
  descricao: string
  pilar_id: string
  responsavel_pilar_id: string
  criado_por: string
  prazo: string
  relevancia: Relevancia
  status: StatusDemanda
  created_at: string
  concluida_em: string | null
  pilar?: Pilar
  responsavel_pilar?: Usuario
  membros?: Usuario[]
}

export interface IndicadorMensal {
  id: string
  pilar_id: string
  usuario_id: string
  mes_referencia: string
  caixas_organizadas: number
  paginas_digitalizadas: number
  documentos_indexados: number
  certificacoes_digitais: number
  evidencia_url: string | null
  created_at: string
}

export interface RelatorioMensal {
  id: string
  usuario_id: string
  pilar_id: string
  mes_referencia: string
  atividades_realizadas: string
  dificuldades: string
  horas_dedicadas: number
  evidencias_urls: string[]
  status: StatusRelatorio
  enviado_em: string | null
  demandas_relacionadas: string[]
  usuario?: Usuario
  pilar?: Pilar
}

export interface Risco {
  id: string
  pilar_id: string
  titulo: string
  descricao: string
  impacto: ImpactoRisco
  probabilidade: ProbabilidadeRisco
  mitigacao: string
  status: string
  pilar?: Pilar
}

export interface TtdCodigo {
  id: string
  codigo: string
  classe: string
  serie: string
  assunto: string
  especie: string
  fase_corrente: string
  fase_intermediaria: string
  destinacao_final: string
  legislacao: string
  observacao: string
  status: StatusTTD
  versao: number
  vigente_desde: string | null
}

export interface Caixa {
  id: string
  numero: string
  setor: string
  status: string
}

export interface Processo {
  id: string
  caixa_id: string
  ttd_codigo_id: string | null
  numero_documento: string
  interessado: string
  assunto_processo: string
  ano_producao: number
  requer_revisao_manual: boolean
  potencial_expositivo: boolean
  created_at: string
  caixa?: Caixa
  ttd?: TtdCodigo
}

export interface Avaliacao {
  id: string
  processo_id: string
  avaliado_por: string
  decisao: string
  ata_referencia: string
  created_at: string
}

export interface PropostaRevisaoTtd {
  id: string
  ttd_codigo_id: string | null
  proposto_por: string
  justificativa: string
  status: StatusProposta
  usuario?: Usuario
  ttd?: TtdCodigo
}

export interface ReuniaoAta {
  id: string
  tipo: TipoReuniaoAta
  pilar_id: string | null
  data_reuniao: string
  resumo: string | null
  encaminhado_nrh: boolean
  criado_por: string | null
  created_at: string
  pilar?: Pilar
}

export interface DepartamentoMapeado {
  id: string
  nome: string
  mapeado: boolean
  mapeado_por: string | null
  data_mapeamento: string | null
  mapeado_por_usuario?: Usuario
}

export interface ProtocoloBoasPraticas {
  id: string
  versao: number
  conteudo: string
  atualizado_por: string | null
  atualizado_em: string
  atualizado_por_usuario?: Usuario
}

export interface BenchmarkingRegistro {
  id: string
  instituicao: string
  data_visita: string | null
  notas: string | null
  registrado_por: string | null
  created_at: string
}

export interface ConsultoriaMemorial {
  id: string
  especialista: string | null
  area: string
  status: StatusConsultoriaMemorial
  data_contratacao: string | null
}

export interface ProjetoMemorial {
  id: string
  conceito_layout: string | null
  orcamento_estimado: number | null
  atualizado_por: string | null
  atualizado_em: string
}

export interface LicitacaoDigitalizacao {
  id: string
  status: StatusLicitacaoDigitalizacao
  tr_validado: boolean
  dotacao_confirmada: boolean
  empresa_contratada: string | null
  data_assinatura: string | null
  data_inicio_execucao: string | null
  atualizado_por: string | null
  atualizado_em: string
}

export interface AtividadeFase {
  id: string
  fase_id: string
  titulo: string
  concluida: boolean
  concluida_por: string | null
  concluida_em: string | null
  criado_por: string | null
  created_at: string
  concluida_por_usuario?: Usuario
}

export interface MuralEvento {
  id: string
  tipo: TipoMuralEvento
  pilar_id: string | null
  usuario_id: string | null
  descricao: string
  ocorrido_em: string
  pilar?: Pilar
  usuario?: Usuario
}

export interface DigitalizacaoMetaAnual {
  id: string
  ano_execucao: number
  caixas_meta: number
  paginas_meta: number
  documentos_meta: number
  certificacoes_meta: number
  investimento_meta: number
  investimento_realizado: number | null
  atualizado_por: string | null
  atualizado_em: string
}

// Supabase DB type wrapper (for createClient generic)
export interface Database {
  public: {
    Tables: {
      usuarios: { Row: Usuario; Insert: Partial<Usuario>; Update: Partial<Usuario> }
      pilares: { Row: Pilar; Insert: Partial<Pilar>; Update: Partial<Pilar> }
      fases: { Row: Fase; Insert: Partial<Fase>; Update: Partial<Fase> }
      demandas: { Row: Demanda; Insert: Partial<Demanda>; Update: Partial<Demanda> }
      indicadores_mensais: { Row: IndicadorMensal; Insert: Partial<IndicadorMensal>; Update: Partial<IndicadorMensal> }
      relatorios_mensais: { Row: RelatorioMensal; Insert: Partial<RelatorioMensal>; Update: Partial<RelatorioMensal> }
      riscos: { Row: Risco; Insert: Partial<Risco>; Update: Partial<Risco> }
      ttd_codigos: { Row: TtdCodigo; Insert: Partial<TtdCodigo>; Update: Partial<TtdCodigo> }
      caixas: { Row: Caixa; Insert: Partial<Caixa>; Update: Partial<Caixa> }
      processos: { Row: Processo; Insert: Partial<Processo>; Update: Partial<Processo> }
      avaliacoes: { Row: Avaliacao; Insert: Partial<Avaliacao>; Update: Partial<Avaliacao> }
      propostas_revisao_ttd: { Row: PropostaRevisaoTtd; Insert: Partial<PropostaRevisaoTtd>; Update: Partial<PropostaRevisaoTtd> }
      reunioes_atas: { Row: ReuniaoAta; Insert: Partial<ReuniaoAta>; Update: Partial<ReuniaoAta> }
      departamentos_mapeados: { Row: DepartamentoMapeado; Insert: Partial<DepartamentoMapeado>; Update: Partial<DepartamentoMapeado> }
      protocolo_boas_praticas: { Row: ProtocoloBoasPraticas; Insert: Partial<ProtocoloBoasPraticas>; Update: Partial<ProtocoloBoasPraticas> }
      benchmarking_registros: { Row: BenchmarkingRegistro; Insert: Partial<BenchmarkingRegistro>; Update: Partial<BenchmarkingRegistro> }
      consultoria_memorial: { Row: ConsultoriaMemorial; Insert: Partial<ConsultoriaMemorial>; Update: Partial<ConsultoriaMemorial> }
      projeto_memorial: { Row: ProjetoMemorial; Insert: Partial<ProjetoMemorial>; Update: Partial<ProjetoMemorial> }
      licitacao_digitalizacao: { Row: LicitacaoDigitalizacao; Insert: Partial<LicitacaoDigitalizacao>; Update: Partial<LicitacaoDigitalizacao> }
      digitalizacao_metas_anuais: { Row: DigitalizacaoMetaAnual; Insert: Partial<DigitalizacaoMetaAnual>; Update: Partial<DigitalizacaoMetaAnual> }
      atividades_fase: { Row: AtividadeFase; Insert: Partial<AtividadeFase>; Update: Partial<AtividadeFase> }
      mural_eventos: { Row: MuralEvento; Insert: Partial<MuralEvento>; Update: Partial<MuralEvento> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
