-- ============================================================================
-- Caixas finais por setor (poços de arquivamento) — Portal CCAD
-- Ver claude/plano-caixas-finais-poco-setor.md no projeto para o desenho completo.
--
-- O que esta migração faz, em resumo:
--   1. Prepara a tabela `caixas` para também representar "caixas finais"
--      (os poços que acumulam processos por setor + destinação até juntar
--      volume suficiente para ir ao Arquivo Geral) — usando a MESMA tabela
--      que já guarda as caixas de entrada (CX001, CX002...), só que com um
--      novo campo `tipo` para diferenciar as duas coisas.
--   2. Cria a tabela de configuração do volume mínimo (editável depois pela
--      tela "Equipe & Responsáveis").
--   3. Cria a função + gatilho que, assim que uma caixa de entrada termina
--      a avaliação, distribui os processos dela automaticamente para os
--      poços certos (por setor + destinação) — sem exigir nenhuma ação
--      manual do Protocolo nesse momento.
--   4. Roda essa distribuição, uma vez, para as caixas que JÁ estão
--      esperando conferência agora (inclusive a CX009 que o Sérgio mostrou).
--
-- Seguro para rodar mais de uma vez (idempotente) — pode rodar de novo sem
-- medo se algo falhar no meio.
-- ============================================================================

-- 1) Novo campo "tipo" em `caixas`: 'entrada' (como já existia, sempre foi
--    assim) ou 'final' (os poços novos). Todo registro já existente vira
--    'entrada' automaticamente (é exatamente o que já eram).
alter table caixas add column if not exists tipo text not null default 'entrada';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'caixas_tipo_check'
  ) then
    alter table caixas add constraint caixas_tipo_check check (tipo in ('entrada', 'final'));
  end if;
end $$;

-- 2) Novo campo "destinacao" — só usado nas caixas tipo='final' (um poço é
--    sempre de uma destinação só: eliminação OU guarda permanente, nunca as
--    duas). Fica em branco (null) nas caixas de entrada, que continuam
--    podendo misturar.
alter table caixas add column if not exists destinacao text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'caixas_destinacao_check'
  ) then
    alter table caixas add constraint caixas_destinacao_check
      check (destinacao is null or destinacao in ('eliminacao', 'guarda_permanente'));
  end if;
end $$;

-- 3) O campo "numero" precisa poder ficar em branco enquanto um poço ainda
--    está "em construção" (acumulando, sem número definitivo aplicado
--    ainda). Não afeta nenhuma caixa já existente.
alter table caixas alter column numero drop not null;

-- 4) Amplia os status possíveis da caixa: além dos que já existiam
--    (catalogada, em_avaliacao, aguardando_conferencia, arquivada), agora
--    também:
--      - 'em_construcao' → só para tipo='final': o poço está aberto,
--        acumulando processos, ainda sem número definitivo.
--      - 'distribuida' → só para tipo='entrada': a caixa de entrada já
--        terminou a avaliação e já distribuiu todos os seus processos para
--        os poços certos — não precisa de mais nenhuma ação sobre ELA
--        (a ação passa a ser sobre os poços).
do $$
declare
  nome_constraint text;
begin
  select con.conname into nome_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'caixas' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%em_avaliacao%';

  if nome_constraint is not null then
    execute format('alter table caixas drop constraint %I', nome_constraint);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'caixas_status_check'
  ) then
    alter table caixas add constraint caixas_status_check
      check (status in ('catalogada', 'em_avaliacao', 'aguardando_conferencia', 'arquivada', 'em_construcao', 'distribuida'));
  end if;
end $$;

-- 5) Só pode existir 1 poço "em_construcao" por combinação setor+destinação
--    ao mesmo tempo (senão os processos novos não saberiam em qual juntar).
create unique index if not exists caixas_poco_aberto_unico
  on caixas (tipo, setor, destinacao)
  where tipo = 'final' and status = 'em_construcao';

-- 6) `processos` ganha uma segunda referência: além de `caixa_id` (de onde
--    o processo veio — nunca muda, é o histórico), agora também
--    `caixa_final_id` (para qual poço/caixa final ele foi, quando já
--    processado). Fica em branco até a distribuição acontecer.
alter table processos add column if not exists caixa_final_id uuid references caixas(id);

-- 7) Configuração do volume mínimo (editável na tela "Equipe &
--    Responsáveis"). Uma linha só, sempre a mesma (id sempre true).
create table if not exists config_arquivamento_final (
  id boolean primary key default true check (id),
  quantidade_minima_eliminacao integer not null default 25,
  quantidade_minima_guarda_permanente integer not null default 25,
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now()
);

insert into config_arquivamento_final (id) values (true)
on conflict (id) do nothing;

alter table config_arquivamento_final enable row level security;

drop policy if exists config_arquivamento_final_select on config_arquivamento_final;
create policy config_arquivamento_final_select on config_arquivamento_final
  for select using (true);

drop policy if exists config_arquivamento_final_update on config_arquivamento_final;
create policy config_arquivamento_final_update on config_arquivamento_final
  for update using (true) with check (true);

-- 8) Função que faz a distribuição de uma caixa de entrada para os poços.
--    Olha a avaliação CONFIRMADA mais recente de cada processo (um
--    processo pode ter mais de uma avaliação no histórico, se já foi
--    devolvido e reavaliado — só a mais recente confirmada conta), agrupa
--    por setor + destinação, acha (ou cria) o poço aberto certo, e liga os
--    processos a ele. No final, marca a caixa de entrada como 'distribuida'.
create or replace function distribuir_caixa_para_pocos(p_caixa_id uuid) returns void as $$
declare
  grupo record;
  v_poco_id uuid;
begin
  for grupo in
    select v.setor, v.destinacao
    from (
      select distinct on (p.id)
        p.id as processo_id,
        p.setor_origem as setor,
        case when lower(a.decisao) like '%elimin%' then 'eliminacao' else 'guarda_permanente' end as destinacao
      from processos p
      join avaliacoes a on a.processo_id = p.id and a.status = 'confirmada'
      where p.caixa_id = p_caixa_id
      order by p.id, a.created_at desc
    ) v
    group by v.setor, v.destinacao
  loop
    if grupo.setor is null then
      -- Processo sem setor de origem preenchido (não deveria acontecer,
      -- mas não trava a distribuição dos demais caso aconteça).
      continue;
    end if;

    select id into v_poco_id
    from caixas
    where tipo = 'final' and status = 'em_construcao'
      and setor = grupo.setor and destinacao = grupo.destinacao
    limit 1;

    if v_poco_id is null then
      insert into caixas (tipo, status, setor, destinacao, numero)
      values ('final', 'em_construcao', grupo.setor, grupo.destinacao, null)
      returning id into v_poco_id;
    end if;

    update processos p
    set caixa_final_id = v_poco_id
    where p.id in (
      select distinct on (p2.id) p2.id
      from processos p2
      join avaliacoes a2 on a2.processo_id = p2.id and a2.status = 'confirmada'
      where p2.caixa_id = p_caixa_id
        and p2.setor_origem = grupo.setor
        and (case when lower(a2.decisao) like '%elimin%' then 'eliminacao' else 'guarda_permanente' end) = grupo.destinacao
      order by p2.id, a2.created_at desc
    );
  end loop;

  update caixas set status = 'distribuida' where id = p_caixa_id;
end;
$$ language plpgsql;

-- 9) Gatilho: assim que uma caixa de entrada chega em
--    'aguardando_conferencia' (o que já acontece sozinho, regra da Fase 19,
--    sem mudança nenhuma nisso), a distribuição roda automaticamente, sem
--    precisar de nenhum clique do Protocolo.
create or replace function trg_distribuir_caixa_para_pocos() returns trigger as $$
begin
  perform distribuir_caixa_para_pocos(new.id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_distribuir_caixa_para_pocos on caixas;
create trigger trg_distribuir_caixa_para_pocos
after update of status on caixas
for each row
when (new.tipo = 'entrada' and new.status = 'aguardando_conferencia' and old.status is distinct from 'aguardando_conferencia')
execute function trg_distribuir_caixa_para_pocos();

-- 10) Roda a distribuição, uma vez, para qualquer caixa de entrada que já
--     esteja esperando conferência agora mesmo (pega a CX009 e qualquer
--     outra pendente) — assim, assim que essa migração terminar, elas já
--     aparecem corretamente separadas em poços por setor, sem precisar de
--     nenhuma ação manual extra.
do $$
declare
  c record;
begin
  for c in select id from caixas where tipo = 'entrada' and status = 'aguardando_conferencia' loop
    perform distribuir_caixa_para_pocos(c.id);
  end loop;
end $$;

-- ============================================================================
-- Conferência pós-migração (rode à parte, se quiser, para ver o resultado):
--
-- select setor, destinacao, status, count(*) as processos
-- from caixas c
-- left join processos p on p.caixa_final_id = c.id
-- where c.tipo = 'final'
-- group by c.id, setor, destinacao, status
-- order by setor, destinacao;
-- ============================================================================
