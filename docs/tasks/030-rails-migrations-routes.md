# Task 030 — Migrations status e routes (Rails, somente leitura)

## Status

Concluída.

## Objetivo

Mostrar, no detalhe de um projeto Rails, o status de migrations (pendentes vs.
aplicadas) e a lista de rotas declaradas (`bin/rails routes`), sem executar
nenhuma mutação — apenas leitura de comandos read-only já conhecidos.

## Escopo entregue

- `RailsInspectionService` (`apps/api/src/services/rails-inspection-service.ts`):
  resolve o comando Rails preferindo `bin/rails` e caindo para
  `bundle exec rails` quando há `Gemfile` com Rails mas sem binstub — mesma
  lógica de preferência já usada em `test-detection-service.ts` e
  `database-detection-service.ts`. Executa `db:migrate:status` e `routes`
  como leitura pontual (não como processo gerenciado), parseando a saída de
  texto para `RailsMigrationsOverview`/`RailsRoutesOverview`.
- Contratos novos em `packages/contracts/src/rails.ts`:
  `RailsMigrationEntry`, `RailsMigrationsOverview`, `RailsRouteEntry`,
  `RailsRoutesOverview`.
- Rotas privadas somente leitura em `apps/api/src/routes/rails.ts`:
  `GET /api/projects/:projectId/rails/migrations` e
  `GET /api/projects/:projectId/rails/routes`.
- `ProjectDatabasePanel.vue` ganhou duas seções adicionais (só para projetos
  `type: 'rails'`): status de migrations (contagem de pendentes, tabela
  versão/nome/status) e lista de rotas com busca simples por caminho,
  `controller#action`, nome ou verbo.
- Testes de serviço (parsing de migrations e rotas, preferência
  bin/bundle, projeto sem Rails, projeto Rails sem `bin/rails`/`Gemfile`,
  falha de execução degradando para não suportado sem lançar, saída sem
  rotas reconhecidas), testes de rota (200, 404 para projeto inexistente,
  401 sem token) e teste montado do painel (migrations pendentes, busca de
  rotas, ausência das seções para projeto Node).

## Decisões e limitações

- O parser de rotas usa os verbos HTTP como âncora (`GET|POST|PUT|PATCH|
  DELETE|HEAD|OPTIONS`) em vez de dividir colunas por espaços, porque a
  saída de `bin/rails routes` não tem largura fixa previsível entre
  versões do Rails. Como consequência, engines montados sem verbo
  explícito na tabela (ex. `mount ActionCable::Server`) não aparecem na
  lista — ficou fora do escopo, documentado aqui em vez de arriscar um
  parser mais frágil.
- Quando o projeto tem Rails mas o comando falha (ex. banco indisponível
  para `db:migrate:status`), o serviço não propaga o erro — reporta
  `supported: false`, no mesmo padrão de degradação graciosa usado pelo
  restante do produto para "não suportado" em vez de expor stderr bruto.
- Migrations e rotas foram adicionadas ao `ProjectDatabasePanel.vue`
  existente (aba "Banco de dados") em vez de uma aba Rails dedicada nova,
  como permitido pelo plano original — evita fragmentar ainda mais a
  navegação do detalhe do projeto por uma entrega inicial somente leitura.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- `migrate`, `rollback`, `seed`, `prepare` ou qualquer mutação no banco.
- Diagnóstico de Bundler, Sidekiq, Webpack, generators ou credenciais.
- Suporte a múltiplos bancos por projeto.
- Rotas de engines montados sem verbo explícito na tabela.
