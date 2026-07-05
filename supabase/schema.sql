-- ============================================================
-- CCAD Platform — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PILARES
-- ============================================================
create table if not exists pilares (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  prazo_meses int,
  responsavel_id uuid -- FK added after usuarios
);

insert into pilares (nome, prazo_meses) values
  ('Digitalização do Acervo', 24),
  ('Protocolo de Boas Práticas', 18),
  ('Espaço Memória da CDTIV', 36)
on conflict do nothing;

-- ============================================================
-- USUARIOS
-- ============================================================
create table if not exists usuarios (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  email text not null,
  papel text not null check (papel in (
    'coordenador','coordenador_substituto','responsavel_pilar','membro','apoio_tecnico'
  )),
  pilar_id uuid references pilares(id),
  status text not null default 'convite_pendente' check (status in ('ativo','convite_pendente'))
);

alter table pilares
  add constraint fk_pilares_responsavel
  foreign key (responsavel_id) references usuarios(id);

-- ============================================================
-- FASES
-- ============================================================
create table if not exists fases (
  id uuid primary key default uuid_generate_v4(),
  pilar_id uuid not null references pilares(id) on delete cascade,
  nome text not null,
  ordem int not null,
  percentual_conclusao numeric default 0 check (percentual_conclusao between 0 and 100)
);

-- Seed fases
insert into fases (pilar_id, nome, ordem) select id, 'Levantamento e Diagnóstico', 1 from pilares where nome = 'Digitalização do Acervo';
insert into fases (pilar_id, nome, ordem) select id, 'Organização Física', 2 from pilares where nome = 'Digitalização do Acervo';
insert into fases (pilar_id, nome, ordem) select id, 'Digitalização', 3 from pilares where nome = 'Digitalização do Acervo';
insert into fases (pilar_id, nome, ordem) select id, 'Indexação', 4 from pilares where nome = 'Digitalização do Acervo';

insert into fases (pilar_id, nome, ordem) select id, 'Mapeamento de Processos', 1 from pilares where nome = 'Protocolo de Boas Práticas';
insert into fases (pilar_id, nome, ordem) select id, 'Elaboração de Manual', 2 from pilares where nome = 'Protocolo de Boas Práticas';
insert into fases (pilar_id, nome, ordem) select id, 'Validação e Aprovação', 3 from pilares where nome = 'Protocolo de Boas Práticas';

insert into fases (pilar_id, nome, ordem) select id, 'Curadoria do Acervo', 1 from pilares where nome = 'Espaço Memória da CDTIV';
insert into fases (pilar_id, nome, ordem) select id, 'Projeto Expográfico', 2 from pilares where nome = 'Espaço Memória da CDTIV';
insert into fases (pilar_id, nome, ordem) select id, 'Implantação', 3 from pilares where nome = 'Espaço Memória da CDTIV';

-- ============================================================
-- DEMANDAS
-- ============================================================
create table if not exists demandas (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  descricao text,
  pilar_id uuid not null references pilares(id),
  responsavel_pilar_id uuid not null references usuarios(id),
  criado_por uuid not null references usuarios(id),
  prazo date,
  relevancia text not null default 'media' check (relevancia in ('alta','media','baixa')),
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  created_at timestamptz default now()
);

create table if not exists demanda_membros (
  demanda_id uuid not null references demandas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  primary key (demanda_id, usuario_id)
);

-- ============================================================
-- INDICADORES MENSAIS
-- ============================================================
create table if not exists indicadores_mensais (
  id uuid primary key default uuid_generate_v4(),
  pilar_id uuid not null references pilares(id),
  usuario_id uuid not null references usuarios(id),
  mes_referencia date not null,
  caixas_organizadas int default 0,
  paginas_digitalizadas int default 0,
  documentos_indexados int default 0,
  evidencia_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- RELATÓRIOS MENSAIS
-- ============================================================
create table if not exists relatorios_mensais (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references usuarios(id),
  pilar_id uuid references pilares(id),
  mes_referencia date not null,
  atividades_realizadas text,
  dificuldades text,
  horas_dedicadas numeric default 0,
  evidencias_urls text[] default '{}',
  status text not null default 'rascunho' check (status in ('rascunho','enviado','atrasado')),
  enviado_em timestamptz,
  demandas_relacionadas uuid[] default '{}',
  unique (usuario_id, mes_referencia)
);

-- ============================================================
-- RISCOS
-- ============================================================
create table if not exists riscos (
  id uuid primary key default uuid_generate_v4(),
  pilar_id uuid references pilares(id),
  titulo text not null,
  descricao text,
  impacto text not null check (impacto in ('alto','medio','baixo')),
  probabilidade text not null check (probabilidade in ('alta','media','baixa')),
  mitigacao text,
  status text not null default 'ativo'
);

-- ============================================================
-- TTD CODIGOS (tabela mestre, versionada)
-- ============================================================
create table if not exists ttd_codigos (
  id uuid primary key default uuid_generate_v4(),
  codigo text not null,
  classe text not null,
  serie text,
  assunto text not null,
  especie text,
  fase_corrente text,
  fase_intermediaria text,
  destinacao_final text,
  legislacao text,
  observacao text,
  status text not null default 'vigente' check (status in ('vigente','proposta','descontinuado')),
  versao int default 1,
  vigente_desde date
);

-- Unique constraint on codigo + versao (not codigo alone, to allow versioning)
create unique index if not exists ttd_codigos_codigo_versao_idx on ttd_codigos(codigo, versao);

-- ============================================================
-- CAIXAS
-- ============================================================
create table if not exists caixas (
  id uuid primary key default uuid_generate_v4(),
  numero text not null unique,
  setor text,
  status text not null default 'catalogada'
);

-- ============================================================
-- PROCESSOS
-- ============================================================
create table if not exists processos (
  id uuid primary key default uuid_generate_v4(),
  caixa_id uuid not null references caixas(id),
  ttd_codigo_id uuid references ttd_codigos(id),
  numero_documento text,
  interessado text,
  assunto_processo text,
  ano_producao int,
  requer_revisao_manual boolean not null default false,
  created_at timestamptz default now()
);

-- ============================================================
-- AVALIACOES
-- ============================================================
create table if not exists avaliacoes (
  id uuid primary key default uuid_generate_v4(),
  processo_id uuid not null references processos(id) on delete cascade,
  avaliado_por uuid not null references usuarios(id),
  decisao text,
  ata_referencia text,
  created_at timestamptz default now()
);

-- ============================================================
-- PROPOSTAS DE REVISÃO TTD
-- ============================================================
create table if not exists propostas_revisao_ttd (
  id uuid primary key default uuid_generate_v4(),
  ttd_codigo_id uuid references ttd_codigos(id),
  proposto_por uuid not null references usuarios(id),
  justificativa text not null,
  status text not null default 'em_analise' check (status in ('em_analise','aprovada','rejeitada'))
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table usuarios enable row level security;
alter table pilares enable row level security;
alter table fases enable row level security;
alter table demandas enable row level security;
alter table demanda_membros enable row level security;
alter table indicadores_mensais enable row level security;
alter table relatorios_mensais enable row level security;
alter table riscos enable row level security;
alter table ttd_codigos enable row level security;
alter table caixas enable row level security;
alter table processos enable row level security;
alter table avaliacoes enable row level security;
alter table propostas_revisao_ttd enable row level security;

-- Helper: get current user's papel
create or replace function get_my_papel()
returns text language sql security definer stable as $$
  select papel from usuarios where id = auth.uid()
$$;

create or replace function get_my_pilar()
returns uuid language sql security definer stable as $$
  select pilar_id from usuarios where id = auth.uid()
$$;

-- USUARIOS: authenticated users can see all; only coord can update others
create policy "usuarios_select" on usuarios for select to authenticated using (true);
create policy "usuarios_insert" on usuarios for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "usuarios_update" on usuarios for update to authenticated
  using (id = auth.uid() or get_my_papel() in ('coordenador','coordenador_substituto'));

-- PILARES: all authenticated can read
create policy "pilares_select" on pilares for select to authenticated using (true);
create policy "pilares_update" on pilares for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- FASES: all read; coord updates
create policy "fases_select" on fases for select to authenticated using (true);
create policy "fases_update" on fases for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- DEMANDAS: coord sees all; others see only their pilar
create policy "demandas_select" on demandas for select to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto','apoio_tecnico')
    or pilar_id = get_my_pilar()
  );
create policy "demandas_insert" on demandas for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "demandas_update" on demandas for update to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or (responsavel_pilar_id = auth.uid())
  );

-- DEMANDA_MEMBROS
create policy "demanda_membros_select" on demanda_membros for select to authenticated using (true);
create policy "demanda_membros_insert" on demanda_membros for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- INDICADORES_MENSAIS
create policy "indicadores_select" on indicadores_mensais for select to authenticated using (true);
create policy "indicadores_insert" on indicadores_mensais for insert to authenticated
  with check (usuario_id = auth.uid());

-- RELATORIOS_MENSAIS
create policy "relatorios_select" on relatorios_mensais for select to authenticated
  using (
    usuario_id = auth.uid()
    or get_my_papel() in ('coordenador','coordenador_substituto','apoio_tecnico')
  );
create policy "relatorios_insert" on relatorios_mensais for insert to authenticated
  with check (usuario_id = auth.uid());
create policy "relatorios_update" on relatorios_mensais for update to authenticated
  using (usuario_id = auth.uid() or get_my_papel() in ('coordenador','coordenador_substituto'));

-- RISCOS: all read; coord/responsavel write
create policy "riscos_select" on riscos for select to authenticated using (true);
create policy "riscos_insert" on riscos for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "riscos_update" on riscos for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- TTD_CODIGOS: all read; only coord can write
create policy "ttd_select" on ttd_codigos for select to authenticated using (true);
create policy "ttd_insert" on ttd_codigos for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "ttd_update" on ttd_codigos for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- CAIXAS / PROCESSOS
create policy "caixas_select" on caixas for select to authenticated using (true);
create policy "caixas_insert" on caixas for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "processos_select" on processos for select to authenticated using (true);
create policy "processos_insert" on processos for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "processos_update" on processos for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- AVALIACOES
create policy "avaliacoes_select" on avaliacoes for select to authenticated using (true);
create policy "avaliacoes_insert" on avaliacoes for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- PROPOSTAS_REVISAO_TTD
create policy "propostas_select" on propostas_revisao_ttd for select to authenticated using (true);
create policy "propostas_insert" on propostas_revisao_ttd for insert to authenticated
  with check (auth.uid() is not null);
create policy "propostas_update" on propostas_revisao_ttd for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index if not exists idx_processos_caixa on processos(caixa_id);
create index if not exists idx_processos_ttd on processos(ttd_codigo_id);
create index if not exists idx_processos_revisao on processos(requer_revisao_manual) where requer_revisao_manual = true;
create index if not exists idx_relatorios_usuario_mes on relatorios_mensais(usuario_id, mes_referencia);
create index if not exists idx_demandas_pilar on demandas(pilar_id);
create index if not exists idx_ttd_codigo on ttd_codigos(codigo);
create index if not exists idx_ttd_status on ttd_codigos(status);

-- Full-text search on TTD
create index if not exists idx_ttd_assunto_fts on ttd_codigos using gin(to_tsvector('portuguese', assunto));

-- ============================================================
-- FASE 2 — pilar pages, meeting minutes, Memorial workflow
-- ============================================================

-- ------------------------------------------------------------
-- Bugfix: usuarios.papel was being silently overwritten to
-- 'responsavel_pilar' whenever someone was set as responsavel_id
-- of a pilar, even if that person was already coordenador or
-- coordenador_substituto. Those two papeis outrank
-- responsavel_pilar and must never be downgraded by that flow.
-- The front-end mutation (EquipePage.tsx) now guards against this,
-- and this trigger is a defense-in-depth backstop at the DB level.
-- ------------------------------------------------------------
create or replace function protect_coordenador_papel()
returns trigger language plpgsql as $$
begin
  if old.papel in ('coordenador','coordenador_substituto') and new.papel is distinct from old.papel then
    new.papel := old.papel;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_coordenador_papel on usuarios;
create trigger trg_protect_coordenador_papel
  before update on usuarios
  for each row execute function protect_coordenador_papel();

-- ------------------------------------------------------------
-- New columns
-- ------------------------------------------------------------
alter table processos add column if not exists potencial_expositivo boolean default false;
-- marks items in Acervo as candidates for the Espaço Memória exhibit

alter table pilares add column if not exists nome_normalizado text;

-- ------------------------------------------------------------
-- Realign fases for Boas Práticas / Espaço Memória to the 5-phase
-- methodology (with month ranges) defined by the Coordenação for
-- Fase 2, replacing the 3-phase placeholder seeded in Fase 1.
-- Digitalização do Acervo's phases are unchanged (out of scope).
-- Guarded by a count check so re-running this script does not
-- reset progress already recorded against the new phases.
-- ------------------------------------------------------------
do $$
declare
  v_boas_praticas_id uuid;
  v_memoria_id uuid;
begin
  select id into v_boas_praticas_id from pilares where nome = 'Protocolo de Boas Práticas';
  select id into v_memoria_id from pilares where nome = 'Espaço Memória da CDTIV';

  if v_boas_praticas_id is not null
     and (select count(*) from fases where pilar_id = v_boas_praticas_id) <> 5 then
    delete from fases where pilar_id = v_boas_praticas_id;
    insert into fases (pilar_id, nome, ordem) values
      (v_boas_praticas_id, 'Mapeamento (mês 1–4)', 1),
      (v_boas_praticas_id, 'Elaboração (mês 5–10)', 2),
      (v_boas_praticas_id, 'Validação (mês 11–16)', 3),
      (v_boas_praticas_id, 'Capacitação (mês 17–22)', 4),
      (v_boas_praticas_id, 'Ajustes (mês 23–24)', 5);
    update pilares set prazo_meses = 24 where id = v_boas_praticas_id;
  end if;

  if v_memoria_id is not null
     and (select count(*) from fases where pilar_id = v_memoria_id) <> 5 then
    delete from fases where pilar_id = v_memoria_id;
    insert into fases (pilar_id, nome, ordem) values
      (v_memoria_id, 'Benchmarking (mês 1–2)', 1),
      (v_memoria_id, 'Consultoria (mês 3–4)', 2),
      (v_memoria_id, 'Acervo expositivo (mês 5–7)', 3),
      (v_memoria_id, 'Projeto (mês 8–10)', 4),
      (v_memoria_id, 'Apresentação (mês 11–12)', 5);
    update pilares set prazo_meses = 12 where id = v_memoria_id;
  end if;
end $$;

-- ------------------------------------------------------------
-- REUNIOES_ATAS
-- ------------------------------------------------------------
create table if not exists reunioes_atas (
  id uuid primary key default uuid_generate_v4(),
  tipo text check (tipo in ('mensal_consolidada','quinzenal_frente','checkpoint_trimestral')) not null,
  pilar_id uuid references pilares(id) null, -- null quando for mensal_consolidada (cobre os 3 pilares)
  data_reuniao date not null,
  resumo text,
  encaminhado_nrh boolean default false, -- obrigatório marcar true para mensal_consolidada (Art. 3º Portaria 026/2026)
  criado_por uuid references usuarios(id),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- DEPARTAMENTOS_MAPEADOS (Protocolo de Boas Práticas)
-- ------------------------------------------------------------
create table if not exists departamentos_mapeados (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  mapeado boolean default false,
  mapeado_por uuid references usuarios(id) null,
  data_mapeamento date null
);

insert into departamentos_mapeados (nome)
select nome from (values
  ('GAF'), ('DAF'), ('NFC'), ('NRH'), ('DTUR'), ('FACITEC'),
  ('GECOM'), ('DAF-Jurídico'), ('Presidência'), ('Inovação'), ('Turismo'), ('Patrimônio')
) as seed(nome)
where not exists (select 1 from departamentos_mapeados)
;

-- ------------------------------------------------------------
-- PROTOCOLO_BOAS_PRATICAS (versioned document)
-- ------------------------------------------------------------
create table if not exists protocolo_boas_praticas (
  id uuid primary key default uuid_generate_v4(),
  versao int not null,
  conteudo text not null,
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- Espaço Memória workflow
-- ------------------------------------------------------------
create table if not exists benchmarking_registros (
  id uuid primary key default uuid_generate_v4(),
  instituicao text not null,
  data_visita date,
  notas text,
  registrado_por uuid references usuarios(id),
  created_at timestamptz default now()
);

create table if not exists consultoria_memorial (
  id uuid primary key default uuid_generate_v4(),
  especialista text,
  area text default 'Museologia e curadoria',
  status text check (status in ('a_contratar','contratado','concluido')) default 'a_contratar',
  data_contratacao date null
);

create table if not exists projeto_memorial (
  id uuid primary key default uuid_generate_v4(),
  conceito_layout text,
  orcamento_estimado numeric,
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- RLS — FASE 2 tables
-- ------------------------------------------------------------
alter table reunioes_atas enable row level security;
alter table departamentos_mapeados enable row level security;
alter table protocolo_boas_praticas enable row level security;
alter table benchmarking_registros enable row level security;
alter table consultoria_memorial enable row level security;
alter table projeto_memorial enable row level security;

-- REUNIOES_ATAS: all authenticated read; coord/responsavel_pilar write
create policy "reunioes_atas_select" on reunioes_atas for select to authenticated using (true);
create policy "reunioes_atas_insert" on reunioes_atas for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "reunioes_atas_update" on reunioes_atas for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));

-- DEPARTAMENTOS_MAPEADOS: all read; coord/responsavel_pilar of Boas Práticas mark
create policy "departamentos_mapeados_select" on departamentos_mapeados for select to authenticated using (true);
create policy "departamentos_mapeados_update" on departamentos_mapeados for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));

-- PROTOCOLO_BOAS_PRATICAS: all read; coord/responsavel_pilar write new versions
create policy "protocolo_boas_praticas_select" on protocolo_boas_praticas for select to authenticated using (true);
create policy "protocolo_boas_praticas_insert" on protocolo_boas_praticas for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- BENCHMARKING_REGISTROS: all read; coord/responsavel_pilar/membro write
create policy "benchmarking_select" on benchmarking_registros for select to authenticated using (true);
create policy "benchmarking_insert" on benchmarking_registros for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));

-- CONSULTORIA_MEMORIAL: all read; coord/responsavel_pilar write
create policy "consultoria_memorial_select" on consultoria_memorial for select to authenticated using (true);
create policy "consultoria_memorial_insert" on consultoria_memorial for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "consultoria_memorial_update" on consultoria_memorial for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- PROJETO_MEMORIAL: all read; coord/responsavel_pilar write
create policy "projeto_memorial_select" on projeto_memorial for select to authenticated using (true);
create policy "projeto_memorial_insert" on projeto_memorial for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "projeto_memorial_update" on projeto_memorial for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

-- PROCESSOS: allow pilar Memória members (and coord/responsavel_pilar) to toggle potencial_expositivo
-- (processos_update policy above already covers coordenador/coordenador_substituto/responsavel_pilar;
-- extend to membro so any Memória pilar member can mark candidates)
drop policy if exists "processos_update" on processos;
create policy "processos_update" on processos for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));

create index if not exists idx_reunioes_atas_pilar on reunioes_atas(pilar_id);
create index if not exists idx_reunioes_atas_tipo on reunioes_atas(tipo);
create index if not exists idx_processos_potencial_expositivo on processos(potencial_expositivo) where potencial_expositivo = true;

-- REUNIOES_ATAS: responsavel_pilar may only insert quinzenal_frente atas for their
-- own pilar; mensal_consolidada (the one forwarded to NRH) stays coordenador-only
drop policy if exists "reunioes_atas_insert" on reunioes_atas;
create policy "reunioes_atas_insert" on reunioes_atas for insert to authenticated
  with check (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or (get_my_papel() = 'responsavel_pilar' and tipo = 'quinzenal_frente' and pilar_id = get_my_pilar())
  );
