-- ============================================================
-- CCAD Platform — Migração Fase 2b (trigger de proteção de papel,
-- coluna nome_normalizado e realinhamento das fases)
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- Pré-requisito: migracao_fase2.sql já aplicado.
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
-- New column
-- ------------------------------------------------------------
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
