# Task 072 — Dependências e build por projeto

## Objetivo

Criar uma área direta para as rotinas recorrentes de preparação de projetos Rails e Node, sem exigir busca no catálogo genérico de Scripts e sem aceitar comandos livres.

## Escopo entregue

- nova aba **Dependências** nos detalhes de projetos Rails e Node;
- projetos Rails:
  - `bundle check`;
  - `bundle install`;
  - `bundle update`, com aviso de alteração possível no `Gemfile.lock`;
- projetos Node:
  - instalação de dependências com npm, pnpm ou Yarn, escolhido pelo lockfile;
  - execução do script exato `build` do `package.json`;
- projetos Rails com `package.json` exibem os blocos Bundler e Node juntos;
- status, duração, exit code, saída mascarada, cancelamento, histórico recente e nova execução;
- ações de dependências e o script `build` deixam de aparecer duplicados no catálogo genérico de Scripts;
- correção da leitura de `db:migrate:status` quando wrappers Rails/Docker escrevem em `stderr`, usam sequências ANSI ou prefixam linhas com o nome do serviço.

## Decisões

- o painel reutiliza `ScriptExecutionService`, incluindo confirmação, lock por projeto, logs privados, mascaramento, cancelamento, SSE e histórico;
- nenhum texto digitado pelo navegador vira comando;
- somente as ações catalogadas `bundler:check`, `bundler:install`, `bundler:update`, `package-manager:install` e `package-script:build` são aceitas;
- o gerenciador Node continua sendo determinado exclusivamente por um único lockfile; ambiguidade permanece bloqueada;
- `build` continua mutável e exige confirmação, porque executa código do projeto e pode gerar arquivos;
- Bundler prefere `bin/docker-bundle` ou `bin/bundle` antes do executável global;
- o parser de migrations combina stdout/stderr do processo Rails, remove códigos ANSI e tolera prefixos do Docker Compose.

## Arquivos principais

- `apps/api/src/services/script-detection-service.ts`
- `apps/api/src/services/script-execution/command-resolution.ts`
- `apps/api/src/services/rails-inspection/command-resolution.ts`
- `apps/api/src/services/rails-inspection/migrations-parsing.ts`
- `apps/web/src/components/ProjectDependenciesPanel.vue`
- `apps/web/src/components/ProjectDependenciesPanel.css`
- `apps/web/src/utils/project-script-visibility.ts`
- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/router/index.ts`
- `packages/contracts/src/script.ts`

## Testes automatizados

- detecção das ações Bundler e Node;
- seleção de npm/Yarn e resolução dos argumentos de install/build;
- projeto Rails com frontend exibindo os dois conjuntos de ações;
- roteamento de dependências/build para a área especializada;
- renderização do painel para Node e Rails híbrido;
- saída de migration status emitida em stderr;
- saída de migration status com sequências ANSI;
- saída de migration status prefixada pelo Docker Compose.

## QA manual

1. Abrir um projeto Rails e confirmar a aba Dependências.
2. Rodar `bundle check` e conferir status, duração e saída.
3. Confirmar que `bundle install` e `bundle update` pedem confirmação.
4. Abrir um projeto com `yarn.lock` e script `build`; conferir `yarn install` e `yarn build`.
5. Cancelar uma execução longa e conferir o estado final.
6. Voltar à aba e confirmar restauração da execução/histórico.
7. Abrir Scripts e confirmar que install/build não aparecem duplicados.
8. Em projeto Rails com wrapper Docker, abrir Migrations e confirmar que a saída é interpretada.

## Limitações

- somente o script chamado exatamente `build` recebe o atalho especializado; variantes como `build:docs` continuam em Scripts;
- `bundle update` atualiza o conjunto permitido pelo Gemfile inteiro, sem seleção de gem nesta entrega;
- projetos Node sem lockfile continuam sem instalação automática segura;
- a validação manual depende de projetos Rails/Node reais no ambiente local.
