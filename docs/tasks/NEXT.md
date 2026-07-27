# Próxima atividade — 031: Migrations status e routes (Rails, somente leitura)

## Contexto

A série "testes focados" está concluída (arquivo específico na task 027,
histórico persistente na 028, eventos SSE na 029). O roadmap passa agora
para "Rails de baixo risco": hoje `DatabaseDetectionService` e
`ProjectDatabasePanel.vue` cobrem detecção de configuração, disponibilidade
e inicialização segura de serviço local, mas não expõem nada específico do
Rails em si (migrations pendentes, rotas declaradas). Esta task cobre só a
parte somente-leitura; operações mutáveis (`migrate`, `rollback`, `seed`,
`prepare`) ficam para uma entrega seguinte com política de risco própria.

## Objetivo

Mostrar, no detalhe de um projeto Rails, o status de migrations (pendentes
vs. aplicadas) e a lista de rotas declaradas (`bin/rails routes`), sem
executar nenhuma mutação — apenas leitura de comandos read-only já
conhecidos, no mesmo padrão de segurança do restante do produto (catálogo
fechado, sem shell arbitrário).

## Plano detalhado

1. Detectar comandos de leitura conhecidos por projeto Rails: status de
   migrations (`bin/rails db:migrate:status` ou `bundle exec rails
   db:migrate:status`, mesma lógica de preferência bin/bundle já usada em
   `database-detection-service.ts` e `test-detection-service.ts`) e rotas
   (`bin/rails routes` ou `bundle exec rails routes`).
2. Executar esses comandos como leitura pontual (não como processo
   gerenciado de longa duração — não é um servidor nem uma suíte de teste),
   parseando a saída para uma estrutura tipada (lista de migrations com
   versão/nome/status; lista de rotas com verbo/path/controller#action).
3. Expor rota(s) privadas somente leitura em `apps/api/src/routes/database.ts`
   (ou um arquivo dedicado, se a mistura de responsabilidades ficar grande).
4. Adicionar ao `ProjectDatabasePanel.vue` (ou um painel Rails dedicado) uma
   seção com o status de migrations e uma lista/busca simples de rotas.
5. Cobrir com testes de serviço (parsing da saída de migrations e de rotas,
   incluindo saída vazia/sem Rails) e de rota; ao menos um teste montado do
   painel.

## Fora do escopo

- `migrate`, `rollback`, `seed`, `prepare` ou qualquer mutação no banco —
  ficam para a entrega seguinte, com confirmação proporcional ao risco.
- Diagnóstico de Bundler, Sidekiq, Webpack, generators ou credenciais.
- Suporte a múltiplos bancos por projeto.
- Execução de migrations pendentes a partir da UI.

## Critérios de aceite

- o detalhe de um projeto Rails mostra migrations pendentes/aplicadas e a
  lista de rotas sem executar nenhuma mutação;
- projetos sem Rails ou sem `bin/rails` continuam funcionando sem erro,
  apenas sem a seção (mesmo padrão de "não suportado" já usado em testes e
  banco);
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
