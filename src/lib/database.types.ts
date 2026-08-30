-- ============================================================
-- FASE 14: Empréstimos de Processos — Etapa 1 (Desarquivamento)
-- ============================================================
-- Cria a base de dados para o módulo de Empréstimos: um novo status no
-- processo (arquivado/emprestado) e a tabela que guarda cada retirada
-- (desarquivamento) feita pelo Protocolo. A devolução e a prorrogação de
-- prazo usam essa mesma estrutura e chegam nas próximas etapas.

-- Novo status de guarda do processo
alter table processos add column if not exists status_emprestimo text not null default 'arquivado'
  check (status_emprestimo in ('arquivado', 'emprestado'));

comment on column processos.status_emprestimo is
  'Situação de guarda do processo: arquivado (disponível no Arquivo Geral) ou emprestado (retirado por alguém).';

-- Tabela de empréstimos: um registro por retirada (desarquivamento)
create table if not exists emprestimos (
  id uuid primary key default uuid_generate_v4(),
  processo_id uuid not null references processos(id),
  solicitante_nome text not null,
  solicitante_matricula text not null,
  protocolista_id uuid not null references usuarios(id),
  desarquivado_em timestamptz not null default now(),
  prazo_previsto date not null,
  devolvido_em timestamptz,
  recebido_por_id uuid references usuarios(id),
  declaracao_retirada_url text,
  declaracao_devolucao_url text,
  created_at timestamptz default now()
);

comment on table emprestimos is
  'Histórico de retiradas (desarquivamento) e devoluções de processos pelo Protocolo. Um processo emprestado tem uma linha aqui com devolvido_em em branco.';

-- Histórico de prorrogações de prazo de um empréstimo (etapa futura, criado já agora para não precisar de nova migração depois)
create table if not exists emprestimo_prorrogacoes (
  id uuid primary key default uuid_generate_v4(),
  emprestimo_id uuid not null references emprestimos(id) on delete cascade,
  prazo_anterior date not null,
  prazo_novo date not null,
  motivo text,
  autorizado_por_id uuid not null references usuarios(id),
  created_at timestamptz default now()
);

comment on table emprestimo_prorrogacoes is
  'Histórico de prorrogações de prazo de devolução de um empréstimo (registrado diretamente pelo Protocolo, sem limite de vezes).';

-- RLS: mesmo padrão do restante do sistema — leitura liberada para todo
-- usuário autenticado; escrita restrita a quem tem acesso à funcionalidade
-- (Coordenador, Coordenador Substituto, ou quem tiver acesso_busca_emprestimos).
alter table emprestimos enable row level security;
alter table emprestimo_prorrogacoes enable row level security;

create policy "emprestimos_select" on emprestimos for select to authenticated using (true);
create policy "emprestimos_insert" on emprestimos for insert to authenticated with check (
  exists (
    select 1 from usuarios u
    where u.id = auth.uid()
      and (u.papel in ('coordenador','coordenador_substituto') or u.acesso_busca_emprestimos = true)
  )
);
create policy "emprestimos_update" on emprestimos for update to authenticated using (
  exists (
    select 1 from usuarios u
    where u.id = auth.uid()
      and (u.papel in ('coordenador','coordenador_substituto') or u.acesso_busca_emprestimos = true)
  )
);

create policy "emprestimo_prorrogacoes_select" on emprestimo_prorrogacoes for select to authenticated using (true);
create policy "emprestimo_prorrogacoes_insert" on emprestimo_prorrogacoes for insert to authenticated with check (
  exists (
    select 1 from usuarios u
    where u.id = auth.uid()
      and (u.papel in ('coordenador','coordenador_substituto') or u.acesso_busca_emprestimos = true)
  )
);

-- Conferência: deve retornar 1 linha em cada consulta
select column_name, data_type from information_schema.columns
  where table_name = 'processos' and column_name = 'status_emprestimo';
select table_name from information_schema.tables where table_name = 'emprestimos';
select table_name from information_schema.tables where table_name = 'emprestimo_prorrogacoes';
