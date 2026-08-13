# Guia da aba Testes

> Parte do [Guia passo a passo do dashboard web](README.md).

**Estado atual (PoC da task 234, item 1):** a aba roda a suíte completa de testes do projeto num
terminal de verdade (PTY via `node-pty`, saída em `xterm.js`) — o mesmo mecanismo do
[Terminal/Console](terminal.md), com a diferença de que a execução é **destacável**: fechar a aba,
recarregar a página ou navegar para outro lugar do dashboard não mata o processo, e reconectar
mostra o buffer acumulado mais o que vier depois. Ver
[`tasks/234-unificar-execucoes-em-terminal.md`](../../tasks/234-unificar-execucoes-em-terminal.md)
para o desenho completo e o histórico da decisão.

## O que está disponível hoje

1. A aba lista os comandos de teste detectados para o projeto (o mesmo detector de sempre — ver
   "Como o dashboard detecta o comando de teste" abaixo) e você escolhe qual rodar, se houver mais
   de um.
2. **Executar suíte completa** dispara o comando via PTY. A saída aparece ao vivo, com cores e
   formatação idênticas ao que apareceria rodando o comando localmente no seu terminal.
3. **Cancelar** interrompe a execução em andamento (TERM, escalando para KILL se não sair a
   tempo).
4. Reconectar à aba (reload, trocar de projeto e voltar) reanexa à execução em andamento — nada se
   perde.

## O que temporariamente saiu do ar

Escopo reduzido de propósito para este PoC — nada foi removido do código, só não está mais
acessível pela aba Testes enquanto o modelo novo não é expandido:

- **Executar um arquivo específico** ou um **caso/padrão de nome** dentro de um arquivo.
- **"Testes relacionados"** às alterações da branch atual (via `git diff`).
- **Histórico** de execuções anteriores, persistente entre reinícios do dashboard.
- **Diagnóstico estruturado** (métricas de sucesso/falha, navegador de falhas, abas Erros/Avisos/
  Detalhes) — a saída agora é o terminal cru; classificação sobre esse texto ainda não foi
  reconstruída.

A implementação anterior (`ProjectTestsGuidedPanel.vue` + `useProjectTestsPanel.ts` +
`useProjectTestProcess.ts`, rodando sobre `processManager` kind `'test'` + SSE) não estava mais
conectada a nenhuma rota desde esta migração e foi removida do código como órfã; para consultá-la,
veja o histórico do Git antes dessa remoção. Repor esses recursos sobre o modelo novo é trabalho
futuro, registrado na task 234.

## Como o dashboard detecta o comando de teste

Só reconhece um conjunto fechado de possibilidades — nunca aceita um comando digitado livremente:

- **Node**: procura scripts `test`, `test:unit` ou `test:ci` no `package.json` e identifica o
  runner (Vitest, Jest, ou o executor nativo `node --test`) pelo próprio script ou pelas
  dependências do projeto. Se não houver script configurado, tenta usar o binário do runner
  instalado localmente (`node_modules/.bin/vitest run` ou `.../jest --ci`).
- **Rails**: usa `bin/rspec`/`bundle exec rspec` quando RSpec é detectado; `bin/rails test`/
  `bundle exec rails test` para Minitest integrado ao Rails; ou `bundle exec rake test` para
  Minitest sem Rails.
- **Python**: só oferece `pytest` (sem argumentos extras) quando há um sinal explícito de que o
  projeto usa Pytest (arquivo `pytest.ini`, `conftest.py`, seção `[tool.pytest]` no
  `pyproject.toml`, ou `pytest` listado em algum `requirements*.txt`).

## Como funciona por trás

- `ProjectTestPtyService` (`apps/api/src/services/project-test-pty-service.ts`) resolve o comando
  via `testDetectionService.resolveCommand` (mesmo detector de sempre) e delega a
  `DetachableExecutionService` (`apps/api/src/services/detachable-execution-service.ts`), que
  spawna o comando num PTY sem atrelar o processo à conexão do navegador.
- Só uma execução por projeto de cada vez (`POST /api/projects/:id/tests/pty/start` recusa uma
  segunda enquanto a primeira roda).
- `GET /api/projects/:id/tests/pty/connect` (WebSocket) é somente leitura — não aceita stdin, já
  que a suíte completa não é um comando interativo.
