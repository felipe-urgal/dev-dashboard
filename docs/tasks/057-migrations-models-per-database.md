# Task 057 — Migrations e Modelos por banco secundário

## Status

Implementação concluída. `typecheck`, `build` e `test` (API e web) aprovados.

## Objetivo

A 055 ensinou a detecção de banco a reconhecer múltiplos bancos por ambiente
(`development: { primary, data }`). As abas **Migrations** e **Modelos**
ainda assumiam um único banco: `db:migrate:status` imprime um bloco
`database: ...` por banco configurado, mas o parser concatenava todas as
migrations numa lista só (a última "database:" lida ganhava, as anteriores
ficavam com o nome errado); `getModelsOverview` só lia `db/schema.rb`,
ignorando `db/<nome>_schema.rb` de bancos secundários — que existe de verdade
no projeto (`db/migrate_data`, `db/data_schema.rb`, ao lado de `db/migrate` e
`db/schema.rb`).

## Resultado

### API

- `listDatabases(project)` (novo, em `rails-inspection-service.ts`): lê
  `db/*_schema.rb` — a evidência de que existe um banco secundário — e
  devolve `['primary', ...secundários]`, ordenados;
- `db:migrate:status` passou a ser interpretado em blocos por banco
  (`parseMigrationStatusBlocks`); cada bloco é correlacionado ao nome
  configurado (`matchMigrationStatusBlock`) pela convenção do próprio Rails
  de sufixar o banco secundário no nome do arquivo/banco impresso (ex.:
  `app_development_data` → `data`); o que sobra é `primary`;
- `getMigrationsOverview`, `getMigrationDetail` e `getModelsOverview` ganham
  um parâmetro `database` (padrão `"primary"`, validado contra a lista
  detectada — um valor desconhecido cai de volta para `primary` em vez de
  compor um caminho de arquivo com entrada não verificada);
- migrations de um banco secundário são lidas de `db/migrate_<nome>` (em vez
  de `db/migrate`); o schema, de `db/<nome>_schema.rb`;
- rotas `GET /rails/migrations`, `GET /rails/migrations/:version` e
  `GET /rails/models` ganham querystring opcional `database` (padrão fechado
  `^[a-z][a-z0-9_]*$`);
- contratos `RailsMigrationsOverview` e `RailsModelsOverview` ganham
  `databases: string[]`.

### Interface

- as abas Migrations e Modelos ganham um seletor de banco (mesmo visual do
  filtro de status, `database-segmented-control`) logo no topo da aba —
  "de cara" — mas só quando há mais de um banco; projetos com um banco só
  não veem nada de novo;
- trocar de banco recarrega a lista de migrations (ou tabelas) daquele banco
  e limpa a seleção anterior; cada aba mantém seu próprio banco selecionado
  de forma independente (trocar em Migrations não afeta Modelos).

## Arquivos principais

- `apps/api/src/services/rails-inspection-service.ts`
- `apps/api/src/routes/rails.ts`
- `apps/api/test/rails-inspection-service.test.ts`
- `apps/web/src/composables/{useRailsMigrations,useRailsModels}.ts`
- `apps/web/src/api/rails.ts`, `apps/web/src/rails-explorer-api.ts`
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `packages/contracts/src/rails.ts`

## Testes

- `apps/api/test/rails-inspection-service.test.ts` — separa migrations por
  banco quando há mais de um; lê o schema do banco secundário pelo nome do
  arquivo;
- `apps/web/test/project-database-panel.test.ts` — seletor de banco aparece e
  troca o conteúdo de Migrations e Modelos de forma independente.

## Limitações conhecidas

- a correlação entre o bloco impresso por `db:migrate:status` e o nome
  configurado em `database.yml` é heurística (nome do arquivo/banco contém o
  nome da configuração, convenção universal do Rails, mas não uma garantia
  formal); um projeto que nomeie o banco de forma incomum pode cair no grupo
  errado;
- `runMigrationMutation` (migrate/rollback/seed/db:prepare) continua
  operando em todos os bancos configurados de uma vez, como o próprio Rails
  faz por padrão — não há como escolher rodar só num banco secundário pela
  interface.

## Próxima atividade

O pedido de gerar `model`/`migration` pela interface (`rails generate`)
segue pendente de dimensionamento: é uma superfície de escrita nova (cria
arquivos no projeto, não só lê ou troca estado de banco), precisa de um
catálogo fechado de tipos de coluna, validação de nome e confirmação em duas
etapas antes de qualquer execução — decisão de escopo e revisão de segurança
próprias, ainda não iniciadas.
