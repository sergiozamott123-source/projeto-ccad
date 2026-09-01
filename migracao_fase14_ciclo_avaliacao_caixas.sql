-- ============================================================
-- CCAD Platform — Migração Fase 14
-- Ciclo de Avaliação de Processos: entrada padronizada de caixas
-- (código sequencial + setor), conferência do Protocolo após a
-- avaliação (com atribuição do número final de arquivamento) e
-- notificação automática à Coordenação via Mural.
--
-- Este arquivo é seguro para rodar mais de uma vez (idempotente).
-- Pré-requisito: migracao_fase7_a_10_requisicoes.sql já aplicada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Novas colunas em CAIXAS
-- ------------------------------------------------------------
-- Quantidade de processos físicos que o Protocolo declarou ao
-- montar a requisição (para conferência de completude da caixa).
alter table caixas add column if not exists quantidade_declarada int;
-- Quem e quando o Protocolo conferiu a avaliação e arquivou a caixa.
alter table caixas add column if not exists conferido_por uuid references usuarios(id);
alter table caixas add column if not exists conferido_em timestamptz;

-- Novo ciclo de vida da caixa (só se aplica às caixas criadas a partir
-- desta fase, via Requisições — caixas antigas continuam 'catalogada',
-- sem qualquer alteração):
--   em_avaliacao         -> acabou de ser criada, com o código de
--                           entrada (ex.: CX001-NSP) no lugar do número,
--                           processos enviados para o avaliador.
--   aguardando_conferencia -> avaliador concluiu todos os processos da
--                           caixa (a requisição correspondente virou
--                           'concluida'); aguardando o Protocolo conferir.
--   arquivada             -> Protocolo conferiu e atribuiu o número
--                           final de arquivamento no Arquivo Geral.
-- O check antigo (se existir) é removido antes de recriar, para não
-- travar em bancos onde a coluna já tinha uma restrição diferente.
alter table caixas drop constraint if exists caixas_status_check;
alter table caixas add constraint caixas_status_check
  check (status in ('catalogada','em_avaliacao','aguardando_conferencia','arquivada'));

-- ------------------------------------------------------------
-- 2) Código de entrada sequencial (CX001-SETOR, CX002-SETOR, ...)
-- ------------------------------------------------------------
-- Sequência única, independente do setor — o setor entra só como
-- sufixo legível do código, a numeração em si é sempre crescente.
create sequence if not exists seq_caixas_entrada start with 1;

create or replace function gerar_codigo_entrada_caixa(p_setor text)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  return 'CX' || lpad(nextval('seq_caixas_entrada')::text, 3, '0')
       || '-' || upper(trim(p_setor));
end;
$$;

grant execute on function gerar_codigo_entrada_caixa(text) to authenticated;

-- ------------------------------------------------------------
-- 3) Sugestão do próximo número de arquivamento final
-- ------------------------------------------------------------
-- Continua a numeração histórica da planilha "Controle de Arquivo
-- Geral" (que ia até a caixa ...936): pega o maior número puramente
-- numérico já usado em CAIXAS.numero e soma 1. Não força nada — é só
-- uma sugestão que o Protocolo confirma (ou troca) na tela de
-- Conferência de Caixas.
create or replace function sugerir_numero_caixa_final()
returns text
language sql
security definer set search_path = public
as $$
  select (coalesce(max(numero::int), 936) + 1)::text
  from caixas
  where numero ~ '^[0-9]+$';
$$;

grant execute on function sugerir_numero_caixa_final() to authenticated;

-- ------------------------------------------------------------
-- 4) Quando a requisição de avaliação termina (todos os processos
-- da caixa já avaliados), a caixa passa a aguardar a conferência
-- do Protocolo. Estende o trigger já existente (set_requisicao_
-- concluida), sem duplicar a lógica de contagem.
-- ------------------------------------------------------------
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

    -- só avança o status da caixa se ela veio deste novo fluxo de
    -- entrada (em_avaliacao) — caixas antigas/catalogadas direto no
    -- Acervo não entram nesta esteira de conferência do Protocolo.
    update caixas
      set status = 'aguardando_conferencia'
      where id = v_caixa_id
        and status = 'em_avaliacao';
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5) Trava contra arquivar a mesma caixa duas vezes + notificação
-- automática no Mural quando a caixa é conferida e arquivada.
-- ------------------------------------------------------------
create or replace function protect_e_notifica_caixa_arquivada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'arquivada' and old.status is distinct from 'arquivada' then
    new.conferido_em := coalesce(new.conferido_em, now());
    insert into mural_eventos (tipo, pilar_id, usuario_id, descricao, ocorrido_em)
    values (
      'caixa_arquivada',
      (select id from pilares where nome = 'Digitalização do Acervo' limit 1),
      new.conferido_por,
      new.numero,
      now()
    );
  elsif new.status = 'arquivada' and old.status = 'arquivada' and new.numero is distinct from old.numero then
    raise exception 'Esta caixa já foi conferida e arquivada — não é possível trocar o número de arquivamento novamente por aqui.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_e_notifica_caixa_arquivada on caixas;
create trigger trg_protect_e_notifica_caixa_arquivada
  before update on caixas
  for each row execute function protect_e_notifica_caixa_arquivada();

-- Novo tipo de evento no Mural.
alter table mural_eventos drop constraint if exists mural_eventos_tipo_check;
alter table mural_eventos add constraint mural_eventos_tipo_check
  check (tipo in ('atividade_concluida','ata_registrada','indicador_lancado','demanda_concluida','fase_concluida','caixa_arquivada'));

-- ------------------------------------------------------------
-- 6) Permissão para o Protocolo (e Coordenação) atualizarem a
-- caixa na hora da conferência (Passo 3). Criação (Passo 1) já é
-- coberta pela policy "caixas_insert" existente (Fase 10).
-- ------------------------------------------------------------
drop policy if exists "caixas_update" on caixas;
create policy "caixas_update" on caixas for update to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto')
    or exists (select 1 from usuarios where id = auth.uid() and pode_criar_requisicoes = true)
  );

create index if not exists idx_caixas_status on caixas(status);
