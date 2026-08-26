-- ============================================================
-- CCAD Platform — Migração Fase 11
-- Etapa A do "Plano de Implementação — Automação do Processo de
-- Avaliação" (26/08/2026): completar os campos coletados no cadastro
-- do processo (Requisição de Avaliação), conforme decisão de Sérgio:
--   1) Interessado deve ser só CDTIV ou PMV (seleção, não digitação livre)
--   2) Data da última movimentação passa a ser obrigatória no cadastro,
--      com opção explícita de "não há data de último despacho"
-- ============================================================

-- ------------------------------------------------------------
-- Interessado: restringe a valores válidos, mas sem quebrar
-- processos antigos que já tenham outro valor (sabemos que existem —
-- é o mesmo problema já visto na planilha "Controle de Arquivo
-- Geral"). "not valid" cria a trava só para dado novo/alterado daqui
-- pra frente, sem varrer nem travar por causa das linhas antigas.
-- ------------------------------------------------------------
alter table processos drop constraint if exists chk_processos_interessado;
alter table processos add constraint chk_processos_interessado
  check (interessado is null or interessado in ('CDTIV', 'PMV'))
  not valid;

-- ------------------------------------------------------------
-- Data da última movimentação (data do último despacho no processo).
-- Guardamos a data em si (quando existir) e uma marcação explícita
-- para quando o processo não tem nenhum despacho registrado — em vez
-- de deixar a coluna simplesmente em branco, que é ambíguo (não
-- perguntado ainda vs. perguntado e não há).
-- ------------------------------------------------------------
alter table processos add column if not exists data_ultima_movimentacao date;
alter table processos add column if not exists sem_data_ultima_movimentacao boolean not null default false;

comment on column processos.data_ultima_movimentacao is
  'Data do último despacho no processo. Nula quando sem_data_ultima_movimentacao = true (processo não tem despacho registrado) ou quando o processo ainda não passou pelo cadastro novo (dado legado).';
comment on column processos.sem_data_ultima_movimentacao is
  'true = confirmado explicitamente que não há data de último despacho para este processo (equivalente ao texto "Não há data de último despacho" do processo manual).';
