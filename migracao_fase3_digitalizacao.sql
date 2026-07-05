-- ============================================================
-- CCAD Platform — Migração Fase 3 (página de governança do
-- Pilar Digitalização do Acervo)
-- Pré-requisito: migracao_fase2.sql e migracao_fase2b.sql já aplicados.
-- ============================================================

-- ------------------------------------------------------------
-- Realinhar as fases da Digitalização ao Plano de Ação real,
-- substituindo o placeholder de 4 fases da Fase 1. Guardado por
-- nome (não por contagem, já que ambos os conjuntos têm 4 fases)
-- para não repetir a operação se o script rodar de novo.
-- ------------------------------------------------------------
do $$
declare
  v_dig_id uuid;
begin
  select id into v_dig_id from pilares where nome = 'Digitalização do Acervo';

  if v_dig_id is not null
     and not exists (
       select 1 from fases
       where pilar_id = v_dig_id and nome = 'Diagnóstico e preparação (mês 1-2)'
     ) then
    delete from fases where pilar_id = v_dig_id;
    insert into fases (pilar_id, nome, ordem) values
      (v_dig_id, 'Diagnóstico e preparação (mês 1-2)', 1),
      (v_dig_id, 'Processo licitatório (mês 3-6)', 2),
      (v_dig_id, 'Contratação e migração (mês 7)', 3),
      (v_dig_id, 'Execução anual (ano 1-5, 20%/ano)', 4);
    update pilares set prazo_meses = 60 where id = v_dig_id;
  end if;
end $$;

-- ------------------------------------------------------------
-- Coluna que faltava em indicadores_mensais para fechar os 4
-- indicadores do Plano de Ação (caixas, páginas, documentos já
-- existiam; faltava certificações digitais).
-- ------------------------------------------------------------
alter table indicadores_mensais add column if not exists certificacoes_digitais int default 0;

-- ------------------------------------------------------------
-- LICITACAO_DIGITALIZACAO (linha única, mesmo padrão de
-- consultoria_memorial / projeto_memorial)
-- ------------------------------------------------------------
create table if not exists licitacao_digitalizacao (
  id uuid primary key default uuid_generate_v4(),
  status text check (status in ('a_iniciar','tr_em_validacao','licitacao_aberta','contratado','em_execucao')) default 'a_iniciar',
  tr_validado boolean default false,
  dotacao_confirmada boolean default false,
  empresa_contratada text,
  data_assinatura date,
  data_inicio_execucao date, -- marca o início do "Ano 1" de execução (20%/ano)
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz default now()
);

-- ------------------------------------------------------------
-- DIGITALIZACAO_METAS_ANUAIS — metas editáveis por ano de
-- execução (1 a 5). Seed = estimativas do Plano de Ação
-- (jun/2026), mas são um PONTO DE PARTIDA, não valores fixos:
-- a tela deve permitir editar qualquer campo a qualquer momento.
-- ------------------------------------------------------------
create table if not exists digitalizacao_metas_anuais (
  id uuid primary key default uuid_generate_v4(),
  ano_execucao int not null unique check (ano_execucao between 1 and 5),
  caixas_meta numeric default 0,
  paginas_meta numeric default 0,
  documentos_meta numeric default 0,
  certificacoes_meta numeric default 0,
  investimento_meta numeric default 0,
  investimento_realizado numeric, -- lançado manualmente pelo Coordenador (sem módulo financeiro ainda)
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz default now()
);

insert into digitalizacao_metas_anuais
  (ano_execucao, caixas_meta, paginas_meta, documentos_meta, certificacoes_meta, investimento_meta)
select * from (values
  (1, 82.96, 24182.40, 1209.12, 1209.12, 18830.20),
  (2, 82.96, 24182.40, 1209.12, 1209.12, 18830.20),
  (3, 82.96, 24182.40, 1209.12, 1209.12, 18830.20),
  (4, 82.96, 24182.40, 1209.12, 1209.12, 18830.20),
  (5, 82.96, 24182.40, 1209.12, 1209.12, 18830.20)
) as seed(ano_execucao, caixas_meta, paginas_meta, documentos_meta, certificacoes_meta, investimento_meta)
where not exists (select 1 from digitalizacao_metas_anuais);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table licitacao_digitalizacao enable row level security;
alter table digitalizacao_metas_anuais enable row level security;

create policy "licitacao_digitalizacao_select" on licitacao_digitalizacao for select to authenticated using (true);
create policy "licitacao_digitalizacao_insert" on licitacao_digitalizacao for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "licitacao_digitalizacao_update" on licitacao_digitalizacao for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));

create policy "digitalizacao_metas_select" on digitalizacao_metas_anuais for select to authenticated using (true);
create policy "digitalizacao_metas_insert" on digitalizacao_metas_anuais for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
create policy "digitalizacao_metas_update" on digitalizacao_metas_anuais for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar'));
