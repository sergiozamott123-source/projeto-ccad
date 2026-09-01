-- ============================================================
-- CCAD Platform — Migração Fase 16
-- Preenchimento automático de atividades no Relatório Mensal:
-- ao clicar em "Importar minhas atividades do mês", o sistema busca
-- quantos processos o membro avaliou e quantas requisições o membro
-- do Protocolo emitiu naquele mês, e grava isso de forma estruturada
-- junto com o relatório (não substitui o texto livre já existente,
-- é um complemento).
--
-- Este arquivo é seguro para rodar mais de uma vez (idempotente).
-- ============================================================

alter table relatorios_mensais add column if not exists processos_avaliados_qtd int not null default 0;
alter table relatorios_mensais add column if not exists processos_avaliados_numeros text[] not null default '{}';
alter table relatorios_mensais add column if not exists requisicoes_emitidas_qtd int not null default 0;
alter table relatorios_mensais add column if not exists requisicoes_emitidas_caixas text[] not null default '{}';
