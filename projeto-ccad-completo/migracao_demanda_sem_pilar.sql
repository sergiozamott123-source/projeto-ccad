-- ============================================================
-- CCAD Platform — Ajuste: Responsável de demanda não fica restrito ao Pilar
-- ============================================================

-- Permite demanda sem pilar vinculado (ex.: Acervo/Protocolo Geral, ou assunto geral)
alter table demandas alter column pilar_id drop not null;

-- Passa a permitir que o responsável veja a demanda mesmo quando ela não
-- pertence ao pilar dele (ou não tem pilar algum)
drop policy if exists "demandas_select" on demandas;
create policy "demandas_select" on demandas for select to authenticated
  using (
    get_my_papel() in ('coordenador','coordenador_substituto','apoio_tecnico')
    or pilar_id = get_my_pilar()
    or responsavel_pilar_id = auth.uid()
  );
