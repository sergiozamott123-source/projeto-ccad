-- ============================================================
-- CCAD Platform — Migração Fase 6 (Central de Relatórios)
-- ============================================================

create table if not exists relatorios_salvos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  filtros jsonb not null default '{}',
  colunas jsonb not null default '[]',
  criado_por uuid references usuarios(id),
  created_at timestamptz default now()
);

alter table relatorios_salvos enable row level security;

create policy "relatorios_salvos_select" on relatorios_salvos for select to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "relatorios_salvos_insert" on relatorios_salvos for insert to authenticated
  with check (get_my_papel() in ('coordenador','coordenador_substituto'));
create policy "relatorios_salvos_delete" on relatorios_salvos for delete to authenticated
  using (get_my_papel() in ('coordenador','coordenador_substituto'));
