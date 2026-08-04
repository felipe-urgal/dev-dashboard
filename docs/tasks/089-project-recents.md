# Task 089 — Projetos recentes por workspace

## Objetivo

Reduzir o tempo de retomada destacando, por workspace, os projetos abertos mais recentemente, sem substituir favoritos nem registrar atividade técnica em segundo plano.

## Decisões

- somente a entrada deliberada em uma rota de detalhe registra acesso;
- o navegador envia apenas `projectId` em uma requisição autenticada;
- workspace e horário são definidos pela API a partir do projeto conhecido;
- o estado é local, versionado e privado em `project-recents.json`;
- scans, polling, command palette e troca de abas internas não registram novo acesso;
- favoritos permanecem acima de recentes;
- no máximo cinco recentes não favoritos recebem indicação visual;
- referências temporariamente ausentes continuam persistidas e voltam a valer quando o projeto reaparece.

## Segurança e limites

- diretório de configuração `0700` e arquivo `0600`;
- escrita atômica por arquivo temporário e `rename`;
- máximo de 20 projetos por workspace e 500 no total;
- nenhum caminho, horário, frequência, conteúdo do projeto ou dado de telemetria é recebido do navegador;
- nenhuma escrita ocorre dentro do repositório do projeto;
- falha no registro não bloqueia a navegação.

## Implementação

- `ProjectRecentRepository` no pacote core;
- `lastAccessedAt` opcional no contrato `Project`;
- rota `POST /api/projects/:projectId/access` com corpo vazio e schema fechado;
- `ProjectStore` centraliza persistência, atualização em memória e restauração em novos scans;
- frontend deduplica o mesmo `projectId`, atualiza a lista carregada e ordena favoritos, recentes e demais;
- cards recentes mostram um rótulo discreto com data completa acessível no título.

## Testes

- persistência, permissões, recarga e atualização sem duplicação;
- separação e limite por workspace;
- degradação segura de arquivo inválido;
- ordenação entre favoritos, recentes e demais;
- limite visual de cinco recentes não favoritos;
- suíte completa, typecheck, build e smoke E2E.

## Resultado

Implementação no PR #183.
