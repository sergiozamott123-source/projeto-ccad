-- ============================================================
-- CCAD Platform — Migração Fase 5 (Protocolo Geral)
-- ============================================================

-- Flag de acesso à área sensível do Acervo, independente do papel do usuário
alter table usuarios add column if not exists acesso_protocolo_geral boolean not null default false;

create or replace function get_my_acesso_protocolo_geral()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(acesso_protocolo_geral, false) from usuarios where id = auth.uid();
$$;

-- Concede a flag à Ana Alzira (usuária já existente)
update usuarios set acesso_protocolo_geral = true where email = 'ana.antoniolli@cdtiv.com.br';

-- Ariadne Silva ainda não existe como usuária — ver passo manual na seção 3
-- antes de rodar a linha abaixo (troque SEU_UUID_AQUI pelo UUID real gerado
-- na criação da conta dela no Supabase Auth):
-- insert into usuarios (id, nome, email, papel, acesso_protocolo_geral)
-- values ('SEU_UUID_AQUI', 'Ariadne Silva', 'ariadne.silva@cdtiv.com.br', 'membro', true);
