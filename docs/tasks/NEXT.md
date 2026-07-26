# Próxima atividade — 014: Página global de processos

## Contexto

Com o painel de atividade unificado (task 012) e a base de testes de UI
(task 013) entregues, o próximo passo do Horizonte 1 do roadmap é uma
página global de processos: leitura consolidada dos servidores e testes
gerenciados, com filtros fechados e limpeza segura de estados elegíveis.

## Objetivo

Expor `/processes` mostrando todos os `ManagedProcess` conhecidos pelo
`ProcessManager` (servidores e testes), com origem, projeto e estado,
sem executar qualquer comando novo. Reaproveitar as regras já validadas
para acesso a logs e para a operação de limpeza existente
(`POST /api/processes/cleanup`).

## Plano detalhado

1. Adicionar (se necessário) uma rota `GET /api/processes` que devolva
   `ManagedProcess[]` já filtrados pelos workspaces cadastrados,
   reaproveitando a autorização das rotas privadas existentes; nenhuma
   estrutura nova de persistência.
2. Criar `apps/web/src/views/ProcessesView.vue` com filtros por
   workspace, projeto e tipo (`server`/`test`), estados
   vazio/carregando/erro/sucesso e link para o detalhe do projeto.
3. Reusar o botão de limpeza (`cleanup`) existente para estados
   elegíveis, com confirmação; nunca sinalizar processos externos ao
   dashboard.
4. Rota `/processes` no `router` e item na sidebar substituindo o
   placeholder "Processos".
5. Testes montados cobrindo os quatro estados, reaproveitando o padrão
   de estubagem de `fetch` da `ActivityView`.
6. Atualizar `README.md`, `docs/roadmap.md` (marcar item concluído) e
   registrar a task 014.

## Fora do escopo

- Killar processos externos ou expor caminhos arbitrários.
- Novo transporte (SSE/WebSocket) — a página é somente leitura com
  refresh manual/periódico simples.
- Migrar histórico de testes para persistência (segue no Horizonte 2).

## Critérios de aceite

- listar servidores e testes ativos sem varrer todos os projetos
  manualmente;
- filtros fechados e paginação suave (ou lista limitada por natureza);
- limpeza segura reaproveitando a operação já existente;
- testes montados nos quatro estados;
- `npm run typecheck`, `npm run build` e `npm test` passam.
