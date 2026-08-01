# Task 062 — Branch atual na lista de projetos

## Status

Concluída.

## Objetivo

Exibir a branch Git atual diretamente em cada projeto da visão geral, sem
obrigar a abertura dos detalhes do repositório.

## Escopo entregue

- consulta do resumo Git somente para projetos que anunciam a capacidade
  `git`;
- selo compacto com a branch atual ao lado da porta do servidor;
- descarte de respostas assíncronas obsoletas quando o projeto da linha muda;
- degradação silenciosa: uma falha na consulta Git não impede abrir o projeto;
- limite visual para nomes longos de branch;
- teste de componente cobrindo branch e porta no mesmo projeto.

## Arquivos alterados

- `apps/web/src/components/ProjectCard.vue`;
- `apps/web/src/styles/components/dashboard.css`;
- `apps/web/test/project-card.test.ts`.

## Decisões

- Reutilizar `GET /api/projects/:projectId/git`, já autenticado e coberto pelo
  contrato `ProjectGitOverview`, em vez de duplicar a branch no contrato básico
  de descoberta de projetos.
- Não exibir placeholder de carregamento: a branch é metadado complementar e
  aparece assim que a consulta termina, preservando a leitura imediata da lista.
- Em HEAD destacado, o selo não é mostrado porque não existe uma branch atual.

## Critérios de aceite

- Projeto com Git e branch atual exibe o nome da branch na listagem.
- Projeto sem Git não dispara a consulta de branch nem exibe o selo.
- A porta continua visível ao lado da branch quando houver servidor gerenciado.
- Falhas na consulta Git não removem nem bloqueiam a linha do projeto.

## Validação

- `npm run build:packages`;
- `npm run test --workspace=@dev-dashboard/web -- --run test/project-card.test.ts`;
- `npm run typecheck --workspace=@dev-dashboard/web`.

## Próxima atividade

As frentes candidatas continuam registradas em `docs/tasks/NEXT.md`, sem nova
prioridade definida por esta melhoria pontual.

## PR

A preencher após a publicação da branch.
