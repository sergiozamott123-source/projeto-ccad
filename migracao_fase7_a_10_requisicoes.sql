-- ============================================================
-- CCAD Platform — Migração Fase 7 a 10 (arquivo único)
-- Avaliação de Processos + Confirmação de Eliminações + Lista de
-- avaliadores autorizados + Requisições de Avaliação + Cadastro dos
-- processos direto na requisição
--
-- Este arquivo substitui TODOS os arquivos de migração anteriores
-- desta funcionalidade. Pode ser rodado com segurança mesmo que um
-- deles já tenha sido executado antes — todos os comandos aqui são
-- seguros para rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- FASE 7 — Novas colunas em AVALIACOES
-- ------------------------------------------------------------
alter table avaliacoes add column if not exists status text not null default 'confirmada'
  check (status in ('aguardando_confirmacao','confirmada','devolvida'));
alter table avaliacoes add column if not exists motivo_devolucao text;
alter table avaliacoes add column if not exists confirmado_por uuid references usuarios(id);
alter table avaliacoes add column if not exists confirmado_em timestamptz;
alter table avaliacoes add column if not exists pilar_id uuid references pilares(id);

create index if not exists idx_avaliacoes_status on avaliacoes(status);
create index if not exists idx_avaliacoes_pilar_status on avaliacoes(pilar_id, status);
create index if not exists idx_avaliacoes_processo on avaliacoes(processo_id);

-- ------------------------------------------------------------
-- FASE 8 — Lista de avaliadores autorizados (independente do pilar)
-- ------------------------------------------------------------
alter table usuarios add column if not exists pode_avaliar_processos boolean not null default false;

-- Libera a Fernanda Pires como avaliadora autorizada.
update usuarios set pode_avaliar_processos = true where email = 'fernanda.pires@cdtiv.com.br';

-- Backstop: pilar_id da avaliação é sempre "Digitalização do Acervo",
-- não mais o pilar pessoal de quem avaliou.
create or replace function set_avaliacao_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pilar_id is null then
    select id into new.pilar_id from pilares where nome = 'Digitalização do Acervo' limit 1;
  end if;
  if new.status is null or new.status = 'confirmada' then
    if new.decisao ilike '%elimin%' then
      new.status := 'aguardando_confirmacao';
    else
      new.status := 'confirmada';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_avaliacao_defaults on avaliacoes;
create trigger trg_set_avaliacao_defaults
  before insert on avaliacoes
  for each row execute function set_avaliacao_defaults();

drop policy if exists "avaliacoes_update" on avaliacoes;
create policy "avaliacoes_update" on avaliacoes for update to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or (get_my_papel() = 'responsavel_pilar' and pilar_id = get_my_pilar())
  );

-- ------------------------------------------------------------
-- FASE 9 — Requisições de Avaliação
-- ------------------------------------------------------------
alter table usuarios add column if not exists pode_criar_requisicoes boolean not null default false;

create table if not exists requisicoes_avaliacao (
  id uuid primary key default uuid_generate_v4(),
  caixa_id uuid not null references caixas(id),
  avaliador_id uuid not null references usuarios(id),
  criado_por uuid not null references usuarios(id),
  status text not null default 'pendente' check (status in ('pendente','concluida','cancelada')),
  created_at timestamptz not null default now(),
  concluida_em timestamptz
);

create unique index if not exists uq_requisicoes_avaliacao_pendente
  on requisicoes_avaliacao(caixa_id, avaliador_id) where status = 'pendente';
create index if not exists idx_requisicoes_avaliador_status on requisicoes_avaliacao(avaliador_id, status);

alter table requisicoes_avaliacao enable row level security;

drop policy if exists "requisicoes_select" on requisicoes_avaliacao;
create policy "requisicoes_select" on requisicoes_avaliacao for select to authenticated
  using (
    avaliador_id = auth.uid()
    or get_my_papel() in ('coordenador','coordenador_substituto')
    or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
  );

drop policy if exists "requisicoes_insert" on requisicoes_avaliacao;
create policy "requisicoes_insert" on requisicoes_avaliacao for insert to authenticated
  with check (
    criado_por = auth.uid()
    and (
      get_my_papel() in ('coordenador','coordenador_substituto')
      or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
    )
    and exists (select 1 from usuarios where id = avaliador_id and pode_avaliar_processos = true)
  );

drop policy if exists "requisicoes_update" on requisicoes_avaliacao;
create policy "requisicoes_update" on requisicoes_avaliacao for update to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
  );

create or replace function set_requisicao_concluida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caixa_id uuid;
  v_pendentes int;
begin
  select caixa_id into v_caixa_id from processos where id = new.processo_id;
  if v_caixa_id is null then
    return new;
  end if;

  select count(*) into v_pendentes
  from processos p
  where p.caixa_id = v_caixa_id
    and not exists (
      select 1 from avaliacoes a
      where a.processo_id = p.id
        and a.status in ('confirmada','aguardando_confirmacao')
    );

  if v_pendentes = 0 then
    update requisicoes_avaliacao
      set status = 'concluida', concluida_em = now()
      where caixa_id = v_caixa_id
        and avaliador_id = new.avaliado_por
        and status = 'pendente';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_requisicao_concluida on avaliacoes;
create trigger trg_set_requisicao_concluida
  after insert on avaliacoes
  for each row execute function set_requisicao_concluida();

drop policy if exists "avaliacoes_insert" on avaliacoes;
create policy "avaliacoes_insert" on avaliacoes for insert to authenticated
  with check (
    avaliado_por = auth.uid()
    and (
      get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar')
      or exists (
        select 1 from requisicoes_avaliacao r
        join processos p on p.caixa_id = r.caixa_id
        where p.id = processo_id
          and r.avaliador_id = auth.uid()
          and r.status = 'pendente'
      )
    )
  );

drop policy if exists "processos_update" on processos;
create policy "processos_update" on processos for update to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar','membro')
    or exists (
      select 1 from requisicoes_avaliacao r
      where r.caixa_id = processos.caixa_id
        and r.avaliador_id = auth.uid()
        and r.status = 'pendente'
    )
  );

create or replace function protect_ttd_codigo_id_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ttd_codigo_id is distinct from old.ttd_codigo_id then
    if not (
      get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar')
      or exists (
        select 1 from requisicoes_avaliacao r
        where r.caixa_id = new.caixa_id
          and r.avaliador_id = auth.uid()
          and r.status = 'pendente'
      )
    ) then
      raise exception 'Você não tem uma requisição de avaliação pendente para esta caixa.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_ttd_codigo_id_update on processos;
create trigger trg_protect_ttd_codigo_id_update
  before update on processos
  for each row execute function protect_ttd_codigo_id_update();

-- ------------------------------------------------------------
-- FASE 10 — Construção de requisições: cadastro dos processos de
-- uma caixa direto na hora de montar a requisição (antes isso era
-- feito à parte, numa planilha, quando as caixas chegavam fisicamente)
-- ------------------------------------------------------------
-- O "Ano" de produção às vezes vem com uma letra junto (ex.: "1993A",
-- "1993-B") — mantemos o ano em si como número (para continuar
-- podendo filtrar/ordenar por ano nos Relatórios) e guardamos essa
-- marcação extra num campo separado.
alter table processos add column if not exists ano_producao_complemento text;
-- Observação anotada no momento da entrega da caixa (antes de avaliar).
alter table processos add column if not exists observacao_intake text;
-- Data em que a caixa chegou fisicamente e foi enviada para avaliação.
alter table requisicoes_avaliacao add column if not exists data_entrega date not null default current_date;

-- Limpeza pontual: alguns processos com número "de verdade" (formato
-- número/ano) foram cadastrados em duplicidade exata na importação
-- inicial dos dados (mesmo número, ano, assunto e interessado, criados
-- no mesmíssimo segundo). Mantemos sempre a cópia mais antiga de cada
-- grupo e removemos só as repetições — nenhum processo real é perdido.
with dupes as (
  select id,
         row_number() over (
           partition by caixa_id, numero_documento, ano_producao, assunto_processo, interessado
           order by created_at, id
         ) as rn
  from processos
  where numero_documento ~ '^\d+(/\d{4}[A-Za-z]{0,2})?$'
)
delete from processos where id in (select id from dupes where rn > 1);

-- Obs.: decidimos NÃO criar uma trava rígida no banco impedindo repetir
-- número+ano na mesma caixa. Em 30+ anos de arquivo há exceções legítimas
-- (ex.: volumes diferentes de um mesmo convênio, catalogados sem letra de
-- diferenciação) que uma trava assim acabaria bloqueando por engano. A
-- proteção contra colar a mesma lista duas vezes sem querer já é feita
-- na própria tela de Requisições, na hora de montar a requisição.

-- Quem monta requisições (Coordenação ou pode_criar_requisicoes, ex.:
-- Ana Alzira) também precisa poder cadastrar a caixa e os processos
-- dela na hora — é o mesmo momento em que a caixa chega fisicamente.
drop policy if exists "caixas_insert" on caixas;
create policy "caixas_insert" on caixas for insert to authenticated
  with check (
    get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar')
    or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
  );

drop policy if exists "processos_insert" on processos;
create policy "processos_insert" on processos for insert to authenticated
  with check (
    get_my_papel() in ('coordenador','coordenador_substituto','responsavel_pilar')
    or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
  );
