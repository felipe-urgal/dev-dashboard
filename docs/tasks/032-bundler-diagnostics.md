# Task 032 — Diagnóstico Bundler (somente leitura)

## Status

Concluída.

## Objetivo

Mostrar, no detalhe de um projeto Rails, um diagnóstico somente leitura do
Bundler: se o bundle está consistente (`bundle check`) e quais gems estão
desatualizadas (`bundle outdated`), sem instalar, atualizar ou modificar
nada.

## Escopo entregue

- `BundlerInspectionService` (`apps/api/src/services/bundler-inspection-service.ts`):
  roda `bundle check` e `bundle outdated` como leitura pontual (mesmo modelo
  de `execFile` sem processo gerenciado das tasks 030/031), com timeout mais
  generoso (45s) já que `bundle outdated` resolve a árvore de dependências.
- Ambos os comandos podem sair com código diferente de zero em uso normal
  (`bundle check` quando insatisfeito, `bundle outdated` quando há gems
  desatualizadas) — o serviço captura `stdout`/`stderr` tanto no caminho de
  sucesso quanto no de rejeição da promise, em vez de tratar qualquer saída
  não-zero como falha de infraestrutura.
- Parser de `bundle outdated` âncora no padrão `* nome (chave valor, ...)`
  e extrai `newest`/`installed`/`requested` por sub-regex dentro dos
  parênteses, tolerante a texto extra depois deles (mais robusto que dividir
  colunas por espaço, mesmo raciocínio do parser de rotas da task 030).
- Contrato `BundlerOverview`/`BundlerCheckResult`/`BundlerOutdatedGem`
  (`packages/contracts/src/bundler.ts`).
- Rota `GET /api/projects/:projectId/bundler`.
- Novo card "Dependências (Bundler)" em `ProjectDatabasePanel.vue` (para
  projetos Rails): badge de status de `bundle check`, mensagem detalhada
  quando insatisfeito, e tabela de gems desatualizadas com busca simples
  por nome.
- Testes de serviço (check satisfeito/insatisfeito, outdated com e sem
  gems, exit code != 0 em ambos os comandos ainda processado normalmente,
  projeto sem Gemfile, mascaramento de segredos na mensagem de erro),
  testes de rota (200/404/401), e testes montados do painel (diagnóstico
  exibido, busca por gem, ausência da seção para projeto Node).

## Decisões e limitações

- Detecção de Gemfile fica restrita a `project.type === 'rails'`, e não a
  "qualquer projeto com Gemfile" como o plano original cogitava — hoje o
  sistema de tipos do produto só distingui `rails`/`node`/`unknown`, e
  Gemfile já é sinal de detecção do tipo `rails` (`packages/project-discovery`).
  Introduzir um tipo "ruby genérico" separado é uma mudança de detecção fora
  do escopo desta entrega somente-leitura.
- Diferente de `RailsInspectionService`, aqui `supported` reflete apenas a
  presença do `Gemfile` — se o binário `bundle` falhar totalmente (ex. não
  instalado), a seção continua marcada como suportada, mas `check.satisfied`
  fica `false` com a mensagem de erro capturada. Isso evita esconder um
  diagnóstico real ("bundler não está instalado") atrás de um estado
  "não suportado" que sugeriria ausência de Gemfile.
- Sem `bundle audit` (auditoria de segurança) nesta entrega — mencionado no
  roadmap como possível entrega futura relacionada, não parte deste
  diagnóstico.
- A seção foi adicionada ao `ProjectDatabasePanel.vue` existente (aba
  "Banco de dados") em vez de uma aba nova, seguindo a mesma decisão das
  tasks 030/031 de não fragmentar a navegação do detalhe do projeto.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- `bundle update`, `bundle install` ou qualquer mutação de dependências.
- Sidekiq, Webpack ou generators.
- Auditoria de segurança de dependências (`bundle audit` ou equivalente).
- Diagnóstico de gems por múltiplos Gemfiles/gemsets no mesmo projeto.
