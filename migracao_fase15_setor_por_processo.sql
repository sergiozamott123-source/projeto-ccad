-- ============================================================
-- CCAD Platform — Migração Fase 15
-- Setor de origem passa a ser um campo por processo, e não mais um
-- único valor para a caixa inteira — uma mesma caixa física pode ter
-- processos abertos por setores diferentes (NRH, NFC, NSP, ASSJUR...).
--
-- Este arquivo é seguro para rodar mais de uma vez (idempotente).
-- Pré-requisito: migracao_fase14_ciclo_avaliacao_caixas.sql já aplicada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Novo campo em PROCESSOS
-- ------------------------------------------------------------
alter table processos add column if not exists setor_origem text;

-- Preenche o histórico: todo processo que já existia herda o setor
-- que estava gravado na caixa dele — nenhuma informação se perde, e
-- as telas de Busca/Relatórios/Empréstimos continuam funcionando
-- exatamente como antes para os dados já cadastrados.
update processos p
set setor_origem = c.setor
from caixas c
where p.caixa_id = c.id
  and p.setor_origem is null
  and c.setor is not null;

create index if not exists idx_processos_setor_origem on processos(setor_origem);

-- ------------------------------------------------------------
-- 2) Código de entrada da caixa deixa de depender de um único setor
-- (a mesma caixa pode ter processos de vários setores) — vira
-- puramente sequencial: CX001, CX002, CX003...
-- A função antiga (com o parâmetro p_setor, da Fase 14) continua
-- existindo sem problema — o Postgres permite as duas por terem
-- assinaturas diferentes — mas a tela de Requisições passa a chamar
-- esta nova, sem parâmetro.
-- ------------------------------------------------------------
create or replace function gerar_codigo_entrada_caixa()
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  return 'CX' || lpad(nextval('seq_caixas_entrada')::text, 3, '0');
end;
$$;

grant execute on function gerar_codigo_entrada_caixa() to authenticated;
