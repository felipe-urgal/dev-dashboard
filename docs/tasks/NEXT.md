# Próxima atividade — 002: Visão de testes do projeto

## Objetivo

Criar a aba `/projects/:projectId/tests` para detectar como cada projeto executa testes, apresentar os comandos disponíveis e permitir uma primeira execução controlada com logs e resultado persistidos pelo dashboard.

## Escopo funcional

- detectar runners por arquivos e scripts: Vitest, Jest, Node Test Runner, RSpec, Rails test, Minitest e pytest quando aplicável;
- listar comandos detectados e a origem de cada detecção;
- indicar quando nenhum runner for reconhecido;
- executar um comando de teste previamente detectado, sem aceitar shell arbitrário enviado pelo navegador;
- mostrar estados `idle`, `starting`, `running`, `passed`, `failed`, `stopped`;
- exibir duração, exit code, início e término;
- streaming/polling de logs com limpeza persistente;
- permitir interrupção do processo de testes;
- impedir duas execuções simultâneas para o mesmo projeto;
- manter servidores e testes como processos independentes;
- layout responsivo e recarga direta da URL.

## Arquitetura planejada

- contratos `ProjectTestCommand`, `ProjectTestOverview` e processo de teste;
- serviço de detecção somente no backend;
- comandos construídos a partir de uma lista permitida e dados já descobertos no projeto;
- integração com `ProcessManager` usando `kind: 'test'`;
- rotas previstas:
  - `GET /api/projects/:projectId/tests`;
  - `GET /api/projects/:projectId/tests/process`;
  - `POST /api/projects/:projectId/tests/:commandId/start`;
  - `POST /api/projects/:projectId/tests/process/stop`;
  - `GET /api/projects/:projectId/tests/process/logs`;
  - `DELETE /api/projects/:projectId/tests/process/logs`.

## Segurança

- nenhum comando ou caminho arbitrário no payload;
- `commandId` precisa existir na detecção atual do projeto;
- execução sem shell intermediário;
- cwd sempre obtido pelo `ProjectStore`;
- limites de log e retenção iguais aos processos de servidor;
- erros sem exposição de caminhos internos desnecessários.

## Testes automatizados esperados

- detecção de cada runner suportado;
- projeto sem testes;
- prioridade quando há mais de um runner;
- start, stop, sucesso e falha;
- bloqueio de comando desconhecido;
- projeto inexistente;
- processo concorrente;
- limpeza e retenção de logs;
- schemas HTTP;
- troca de projeto no frontend sem estado residual.

## QA manual esperado

Validar pelo menos um projeto Node e um Rails, incluindo execução com sucesso, falha intencional, interrupção, logs, recarga da rota e tentativa de iniciar duas vezes.

## Fora do escopo inicial

- seleção de arquivo ou teste individual;
- cobertura de código;
- modo watch;
- edição de comandos personalizados;
- integração com CI remoto.
