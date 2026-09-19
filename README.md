# Dev Dashboard

Dashboard local para descobrir projetos e centralizar Git, processos, testes, banco, dependências, Docker Compose, logs e operações controladas de produção.

## Stack

- Vue 3 + TypeScript
- Fastify
- npm workspaces
- Node.js 20.19+ / 22.12+

## Desenvolvimento

    npm ci
    npm run doctor
    npm run dev

Gate principal:

    npm run check

E2E quando necessário:

    npm run test:e2e

## Segurança

A API local é a fronteira de segurança. Ações estruturadas não devem aceitar shell arbitrário vindo do navegador. Operações Git, banco e produção devem manter validação e confirmação adequadas ao risco. A remoção de Worktrees também respeita ownership por Environment Instance: processos, terminais e Docker Compose owned bloqueiam a remoção até que o recurso seja encerrado explicitamente; desaparecimentos externos ficam como `cleanup-required` quando o Compose ainda não pode ser reconciliado com segurança.

## Documentação

- [Desenvolvimento](docs/DEVELOPMENT.md)
- [Template de tarefa](docs/TASK_TEMPLATE.md)
- [Guia de code review](docs/CODE_REVIEW.md)

Regras para agentes estão em [AGENTS.md](AGENTS.md).
