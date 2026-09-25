-- ============================================================
-- CCAD Platform — Migração Fase 4 (Atividades por Fase + Mural
-- de Conquistas da CCAD)
-- Pré-requisito: migracao_fase3_digitalizacao.sql já aplicada.
-- ============================================================

-- ------------------------------------------------------------
-- ATIVIDADES_FASE — checklist livre por fase, reutilizável pelos
-- três pilares (não amarrado a Digitalização especificamente).
-- ------------------------------------------------------------
create table if not exists atividades_fase (
  id uuid primary key default uuid_generate_v4(),
  fase_id uuid not null references fases(id) on delete cascade,
  titulo text not null,
  concluida boolean default false,
  concluida_por uuid references usuarios(id),
  concluida_em date,
  criado_por uuid references usuarios(id),
  created_at timestamptz default now()
);

alter table atividades_fase enable row level security;
create policy "atividades_fase_select" on atividades_fase for select to authenticated using (true);
create policy "atividades_fase_insert" on atividades_fase for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));
create policy "atividades_fase_update" on atividades_fase for update to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro'));

create index if not exists idx_atividades_fase_fase on atividades_fase(fase_id);

-- ------------------------------------------------------------
-- DEMANDAS — coluna que faltava para o mural conseguir ordenar
-- por data real de conclusão (hoje só existe created_at).
-- ------------------------------------------------------------
alter table demandas add column if not exists concluida_em timestamptz;

-- ------------------------------------------------------------
-- MURAL_EVENTOS — feed único, alimentado só por triggers.
-- ------------------------------------------------------------
create table if not exists mural_eventos (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('atividade_concluida','ata_registrada','indicador_lancado','demanda_concluida','fase_concluida')),
  pilar_id uuid references pilares(id),
  usuario_id uuid references usuarios(id), -- null em 'fase_concluida' (conquista da equipe, não de uma pessoa só)
  descricao text not null,
  ocorrido_em timestamptz not null default now()
);

alter table mural_eventos enable row level security;
create policy "mural_eventos_select" on mural_eventos for select to authenticated using (true);
create index if not exists idx_mural_eventos_ocorrido_em on mural_eventos(ocorrido_em desc);

-- ------------------------------------------------------------
-- TRIGGER 1 — ao inserir/atualizar/apagar uma atividade:
-- recalcula o percentual da fase e, se a atividade acabou de
-- ser marcada como concluída, registra o evento no mural.
-- ------------------------------------------------------------
create or replace function sync_atividade_fase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pilar_id uuid;
  v_total int;
  v_concluidas int;
  v_fase_id uuid := coalesce(new.fase_id, old.fase_id);
begin
  select pilar_id into v_pilar_id from fases where id = v_fase_id;

  select count(*), count(*) filter (where concluida) into v_total, v_concluidas
  from atividades_fase where fase_id = v_fase_id;

  update fases
  set percentual_conclusao = case when v_total > 0 then round(100.0 * v_concluidas / v_total) else 0 end
  where id = v_fase_id;

  if tg_op in ('INSERT','UPDATE') and new.concluida
     and (tg_op = 'INSERT' or old.concluida is distinct from true) then
    insert into mural_eventos (tipo, pilar_id, usuario_id, descricao, ocorrido_em)
    values ('atividade_concluida', v_pilar_id, new.concluida_por, new.titulo, coalesce(new.concluida_em::timestamptz, now()));
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_atividade_fase on atividades_fase;
create trigger trg_sync_atividade_fase
  after insert or update or delete on atividades_fase
  for each row execute function sync_atividade_fase();

-- ------------------------------------------------------------
-- TRIGGER 2 — quando uma fase bate 100%, registra a conquista
-- como evento de equipe (sem usuario_id específico).
-- ------------------------------------------------------------
create or replace function notify_fase_concluida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.percentual_conclusao = 100 and old.percentual_conclusao is distinct from 100 then
    insert into mural_eventos (tipo, pilar_id, descricao, ocorrido_em)
    values ('fase_concluida', new.pilar_id, new.nome, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_fase_concluida on fases;
create trigger trg_notify_fase_concluida
  after update on fases
  for each row execute function notify_fase_concluida();

-- ------------------------------------------------------------
-- TRIGGER 3 — ata de reunião registrada.
-- ------------------------------------------------------------
create or replace function notify_ata_registrada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into mural_eventos (tipo, pilar_id, usuario_id, descricao, ocorrido_em)
  values ('ata_registrada', new.pilar_id, new.criado_por, 'Ata de reunião registrada', new.created_at);
  return new;
end;
$$;

drop trigger if exists trg_notify_ata_registrada on reunioes_atas;
create trigger trg_notify_ata_registrada
  after insert on reunioes_atas
  for each row execute function notify_ata_registrada();

-- ------------------------------------------------------------
-- TRIGGER 4 — indicador mensal lançado.
-- ------------------------------------------------------------
create or replace function notify_indicador_lancado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into mural_eventos (tipo, pilar_id, usuario_id, descricao, ocorrido_em)
  values ('indicador_lancado', new.pilar_id, new.usuario_id, 'Indicadores do mês lançados', new.created_at);
  return new;
end;
$$;

drop trigger if exists trg_notify_indicador_lancado on indicadores_mensais;
create trigger trg_notify_indicador_lancado
  after insert on indicadores_mensais
  for each row execute function notify_indicador_lancado();

-- ------------------------------------------------------------
-- TRIGGER 5 — demanda concluída: marca concluida_em e registra
-- o evento no mesmo movimento.
-- ------------------------------------------------------------
create or replace function notify_demanda_concluida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    new.concluida_em := now();
    insert into mural_eventos (tipo, pilar_id, usuario_id, descricao, ocorrido_em)
    values ('demanda_concluida', new.pilar_id, new.responsavel_pilar_id, new.titulo, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_demanda_concluida on demandas;
create trigger trg_notify_demanda_concluida
  before update on demandas
  for each row execute function notify_demanda_concluida();
