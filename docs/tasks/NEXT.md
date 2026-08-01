# Próxima atividade — 057: migrations e modelos por banco secundário

## Contexto

A 055 ensinou a detecção de banco (`config/database.yml`) a reconhecer o
formato Rails 6+ de múltiplos bancos por ambiente (`development: { primary,
data }`). As abas **Migrations** e **Modelos**, porém, ainda assumem um único
banco por projeto: `RailsInspectionService.getMigrationsOverview` roda
`db:migrate:status` e devolve uma lista única (que na prática mistura as
migrations de `db/migrate` e `db/migrate_data` quando o projeto tem um
`migrations_paths` secundário), e `getModelsOverview` só lê `db/schema.rb`,
ignorando `db/<nome>_schema.rb` de bancos secundários.

## Objetivo

Deixar explícito, "de cara", quando um projeto tem mais de um banco: um
seletor no topo de Migrations e de Modelos para trocar entre eles, cada um
com sua própria lista de migrations (`db/migrate` vs. `db/migrate_<nome>`) e
seu próprio schema (`db/schema.rb` vs. `db/<nome>_schema.rb`).

## Plano sugerido

1. `RailsInspectionService`: um helper para listar os bancos do projeto —
   mais simples e robusto lendo `db/*_schema.rb` (a própria evidência de que
   existe um banco secundário) do que reinterpretar `database.yml`; `primary`
   sempre existe.
2. `getMigrationsOverview`/`getMigrationDetail` ganham um parâmetro
   `database` (padrão `primary`); `db:migrate:status` imprime um bloco
   `database: ...` por banco configurado — separar os blocos em vez de
   concatenar todas as migrations numa lista só, e usar `db/migrate` ou
   `db/migrate_<nome>` para achar o arquivo-fonte.
3. `getModelsOverview` ganha o mesmo parâmetro `database`, lendo
   `db/<nome>_schema.rb` em vez de `db/schema.rb` quando for secundário.
4. Contratos: `RailsMigrationsOverview` e `RailsModelsOverview` ganham
   `databases: string[]`; rotas `/rails/migrations`, `/rails/migrations/:version`
   e `/rails/models` ganham querystring `database`.
5. `ProjectDatabasePanel.vue`: seletor de banco (segmented control, só
   aparece quando `databases.length > 1`) no topo das abas Migrations e
   Modelos, reaproveitando os composables já existentes com um novo estado de
   banco selecionado.

## Fora do escopo

- gerar migrations ou models pela interface (`rails generate migration|model`)
  — pedido separado, ainda por dimensionar (superfície de escrita nova:
  cria arquivos, precisa de catálogo fechado de tipos de coluna e validação
  de nome antes de qualquer confirmação em duas etapas);
- correlacionar banco lógico ↔ arquivo de schema por qualquer via além do
  nome do arquivo (`<nome>_schema.rb`); não há necessidade de reler
  `database.yml` para isso.
