# Prompt de Implementação — Plataforma Projeto CCAD

> Cole este documento inteiro como instrução inicial para o Claude Code. Os arquivos `ttd_seed.csv` e `processos_seed.csv` (anexos) devem estar na raiz do projeto antes de rodar a etapa de seed.

## 1. Contexto

A CCAD (Comissão Central de Avaliação de Documentos) da CDTIV (Cia de Desenvolvimento, Turismo e Inovação de Vitória) precisa de uma plataforma web para:

1. Executar e acompanhar o **Plano de Ação do Projeto CCAD** (3 pilares: Digitalização do Acervo, Protocolo de Boas Práticas, Espaço Memória da CDTIV).
2. Substituir a catalogação do acervo documental (hoje em planilha Excel) por um **banco de dados estruturado**, com a Tabela de Temporalidade Documental (TTD) como tabela mestre.

Este é um projeto **novo e independente**, sem relação de código com o sistema FACITEC CONECTA (mesma organização, projeto separado).

## 2. Stack técnica

- **Frontend:** React + Vite
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage)
- **Deploy:** Vercel
- **Autenticação:** Supabase Auth (e-mail/senha), papéis controlados via tabela `usuarios`

## 3. Modelo de governança (regra de negócio central)

- **Coordenador** (Sérgio Paulo Tomaz): demanda tarefas, define prioridade, tem acesso e controle total de tudo.
- **Coordenador substituto**: mesmo nível de acesso do Coordenador.
- **Responsável de Pilar**: uma pessoa eleita por pilar (Digitalização / Boas Práticas / Espaço Memória). Recebe demandas do Coordenador e organiza a execução com os membros do seu pilar.
- **Membro**: executa demandas recebidas, dentro do pilar em que atua. Loga e atualiza sua própria parte.
- **Apoio técnico** (ex: Arquivista PMV/SEGES): acesso de consulta a todos os módulos.

Fluxo: **Coordenador demanda → Responsável do Pilar organiza → Membros executam → lançam indicador/relatório → Coordenador acompanha.**

## 4. Modelo de dados (schema Supabase/PostgreSQL)

```sql
-- Usuários e papéis
usuarios (
  id uuid pk references auth.users,
  nome text, email text,
  papel text check (papel in ('coordenador','coordenador_substituto','responsavel_pilar','membro','apoio_tecnico')),
  pilar_id uuid references pilares(id) null,
  status text check (status in ('ativo','convite_pendente')) default 'convite_pendente'
)

-- Estrutura do Plano de Ação
pilares (
  id uuid pk, nome text, -- 'Digitalização do Acervo','Protocolo de Boas Práticas','Espaço Memória da CDTIV'
  prazo_meses int, responsavel_id uuid references usuarios(id) null
)

fases (
  id uuid pk, pilar_id uuid references pilares(id),
  nome text, ordem int, percentual_conclusao numeric default 0
)

demandas (
  id uuid pk, titulo text, descricao text,
  pilar_id uuid references pilares(id),
  responsavel_pilar_id uuid references usuarios(id),
  criado_por uuid references usuarios(id), -- sempre coordenador
  prazo date, relevancia text check (relevancia in ('alta','media','baixa')),
  status text check (status in ('pendente','em_andamento','concluida')) default 'pendente',
  created_at timestamptz default now()
)

demanda_membros ( demanda_id uuid references demandas(id), usuario_id uuid references usuarios(id) )

indicadores_mensais (
  id uuid pk, pilar_id uuid references pilares(id), usuario_id uuid references usuarios(id),
  mes_referencia date, caixas_organizadas int, paginas_digitalizadas int,
  documentos_indexados int, evidencia_url text, created_at timestamptz default now()
)

relatorios_mensais (
  id uuid pk, usuario_id uuid references usuarios(id), pilar_id uuid references pilares(id),
  mes_referencia date, atividades_realizadas text, dificuldades text,
  horas_dedicadas numeric, evidencias_urls text[],
  status text check (status in ('rascunho','enviado','atrasado')) default 'rascunho',
  enviado_em timestamptz null,
  -- obrigatório até o dia 20 de cada mês; job agendado marca 'atrasado' após essa data
  demandas_relacionadas uuid[] -- refs a demandas.id concluídas no mês
)

riscos (
  id uuid pk, pilar_id uuid references pilares(id), titulo text, descricao text,
  impacto text check (impacto in ('alto','medio','baixo')),
  probabilidade text check (probabilidade in ('alta','media','baixa')),
  mitigacao text, status text default 'ativo'
)

-- TTD como tabela mestre (versionada)
ttd_codigos (
  id uuid pk, codigo text unique, classe text, -- '01 - Atividades-Meio' | '02 - Atividades-Fim'
  serie text, assunto text, especie text,
  fase_corrente text, fase_intermediaria text, destinacao_final text,
  legislacao text, observacao text,
  status text check (status in ('vigente','proposta','descontinuado')) default 'vigente',
  versao int default 1, vigente_desde date null
)

-- Acervo documental
caixas ( id uuid pk, numero text unique, setor text, status text default 'catalogada' )

processos (
  id uuid pk, caixa_id uuid references caixas(id),
  ttd_codigo_id uuid references ttd_codigos(id),
  numero_documento text, interessado text, assunto_processo text,
  ano_producao int, requer_revisao_manual boolean default false,
  created_at timestamptz default now()
)

avaliacoes (
  id uuid pk, processo_id uuid references processos(id),
  avaliado_por uuid references usuarios(id), decisao text,
  ata_referencia text, created_at timestamptz default now()
)

propostas_revisao_ttd (
  id uuid pk, ttd_codigo_id uuid references ttd_codigos(id) null, -- null se for novo código
  proposto_por uuid references usuarios(id), justificativa text,
  status text check (status in ('em_analise','aprovada','rejeitada')) default 'em_analise'
)
```

## 5. Telas a implementar (já validadas via mockup com o Coordenador)

1. **Dashboard do Coordenador** — cards de métricas (caixas organizadas, páginas digitalizadas, departamentos mapeados, relatórios em dia), progresso dos 3 pilares lado a lado, próximos marcos, alertas de risco.
2. **Minha Parte** (visão do membro) — pilar/fase em que está alocado, tarefas do mês vindas de demandas recebidas, lançamento rápido de indicador com upload de evidência.
3. **Nova Demanda** (Coordenador) — formulário: título, pilar, responsável do pilar, membros adicionais, prazo, relevância, descrição. Ao salvar, notifica o responsável do pilar.
4. **Relatório Mensal** (membro) — obrigatório até o dia 20 de cada mês; mês de referência, pilar, checklist de demandas recebidas no mês, atividades realizadas, dificuldades, horas dedicadas, anexos. Botão salvar rascunho / enviar.
5. **Painel de Conformidade dos Relatórios** (Coordenador) — resumo (enviados/pendentes/atrasados), tabela por membro com status e botão de lembrete para atrasados.
6. **Matriz de Riscos** — grade impacto × probabilidade + lista detalhada com mitigação por risco, por pilar.
7. **Equipe e Responsáveis** — eleição do responsável por pilar (dropdown), tabela completa da equipe com papel/pilar/status de acesso, convite de novos membros.
8. **Catalogar Processo** (módulo Acervo) — caixa, setor, ano; campo de busca autocomplete na TTD (por código ou assunto); ao selecionar, auto-preenche fase corrente, fase intermediária e destinação final (somente leitura); número do documento, interessado, assunto do processo, observação.

Design: usar cards com bordas suaves, paleta navy (#20283B) + teal (#0E7C86) + laranja (#E8703A) como accent, consistente com a identidade visual já usada nas apresentações da CCAD.

## 6. Regras de negócio importantes

- **TTD é somente leitura para membros/responsáveis.** Só o Coordenador (ou fluxo de aprovação formal) pode alterar códigos vigentes.
- **Toda alteração na TTD é versionada** — nunca sobrescrever; criar nova versão preservando o histórico, para que processos já classificados nunca percam a referência.
- **Relatório mensal:** job agendado (cron/Supabase Edge Function) roda todo dia 21 e marca como "atrasado" quem não enviou o relatório do mês anterior.
- **Nova Demanda:** só o Coordenador ou Coordenador substituto pode criar. Notificação (e-mail ou in-app) ao Responsável do Pilar.
- **Proposta de Revisão de Código TTD:** qualquer membro pode propor (tabela `propostas_revisao_ttd`), mas só o Coordenador aprova, gerando nova versão do código na `ttd_codigos`.
- **Regra de segurança de dados:** em caso de dúvida durante a reclassificação retroativa de processos legados, classificar como "requer_revisao_manual = true" em vez de aplicar destinação de eliminação por padrão.

## 7. Seed de dados reais (usar os arquivos anexos)

- **`ttd_seed.csv`** (405 linhas) → popular `ttd_codigos`. Coluna `status` distingue `vigente` (Classe 01, 375 códigos oficiais) de `proposta` (Classe 02, 30 códigos novos, ainda não homologados — devem aparecer com indicação visual de "proposta" na interface).
- **`processos_seed.csv`** (8.494 linhas, já limpo) → popular `caixas` e `processos`:
  - Coluna `codigo_valido_na_ttd = 'sim'` (5.683 linhas): vincular direto ao `ttd_codigos` correspondente.
  - Coluna `requer_revisao_manual = 'sim'` (2.811 linhas): importar mesmo assim, mas marcar o campo `requer_revisao_manual = true` no processo e deixar `ttd_codigo_id` nulo — essas linhas aparecem em uma fila de revisão para o Coordenador/Responsável de Pilar tratar manualmente.
  - Deduplicar caixas por número antes de inserir processos.

## 8. Fora de escopo nesta primeira versão

- Aplicativo mobile nativo (a versão web deve ser responsiva, mas não é PWA nesta fase).
- Assinatura eletrônica de termos de eliminação (fica para fase futura, quando a TTD for homologada pelo Arquivo Público Municipal).
- Integração com o FACITEC CONECTA (projetos permanecem independentes).

---

**Ordem de implementação sugerida:** (1) schema + auth + seed TTD/processos → (2) módulo Governança (Equipe, Dashboard) → (3) módulo Demandas + Minha Parte → (4) Relatórios + Conformidade → (5) Riscos → (6) módulo Acervo/Catalogação.
