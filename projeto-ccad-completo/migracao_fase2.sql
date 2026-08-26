-- ============================================================
-- CCAD Platform — Migração Fase 2 (tabelas novas + RLS + índices)
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- Pré-requisito: schema da Fase 1 (usuarios, pilares, processos, etc.)
-- já aplicado, incluindo as funções get_my_papel() e get_my_pilar().
-- ============================================================

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
-- Coluna necessária para o índice idx_processos_potencial_expositivo
-- abaixo e para o toggle "candidato à exposição" em AcervoPage.tsx
-- ------------------------------------------------------------
alter table processos add column if not exists potencial_expositivo boolean default false;

-- ------------------------------------------------------------
-- RLS — FASE 2 tables
-- ------------------------------------------------------------
alter table reunioes_atas enable row level security;
alter table departamentos_mapeados enable row level security;
alter table protocolo_boas_praticas enable row level security;
alter table benchmarking_registros enable row level security;
alter table consultoria_memorial enable row level security;
alter table projeto_memorial enable row level security;

-- REUNIOES_ATAS: all authenticated read; coord/responsavel_pilar update;
-- insert já nasce com a regra final (responsavel_pilar só quinzenal_frente do próprio pilar)
create policy "reunioes_atas_select" on reunioes_atas for select to authenticated using (true);
create policy "reunioes_atas_update" on reunioes_atas for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "reunioes_atas_insert" on reunioes_atas for insert to authenticated
  with check (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or (get_my_papel() = 'responsavel_pilar' and tipo = 'quinzenal_frente' and pilar_id = get_my_pilar())
  );

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
drop policy if exists "processos_update" on processos;
create policy "processos_update" on processos for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
create index if not exists idx_reunioes_atas_pilar on reunioes_atas(pilar_id);
create index if not exists idx_reunioes_atas_tipo on reunioes_atas(tipo);
create index if not exists idx_processos_potencial_expositivo on processos(potencial_expositivo) where potencial_expositivo = true;
