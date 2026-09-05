# Guia da aba Testes

> Parte do [Guia passo a passo do dashboard web](README.md).

**Estado atual:** a aba roda a suíte completa de testes do projeto num terminal de verdade (PTY via `node-pty`, saída em `xterm.js`) — o mesmo mecanismo do [Terminal/Console](terminal.md), com a diferença de que a execução é **destacável**: fechar a aba, recarregar a página ou navegar para outro lugar do dashboard não mata o processo, e reconectar mostra o buffer acumulado mais o que vier depois. O buffer do backend e o scrollback visual do navegador possuem limites para evitar crescimento indefinido durante execuções longas.

## O que está disponível hoje

1. A aba lista os comandos de teste detectados para o projeto e você escolhe qual rodar, se houver mais de um.
2. O bloco **Test Intelligence** consulta uma recomendação read-only para o comando selecionado e cruza os arquivos alterados da branch com testes diretamente relacionados conhecidos.
3. **Executar suíte completa** dispara o comando via PTY. A saída aparece ao vivo, com cores e formatação idênticas ao que apareceria rodando o comando localmente no seu terminal.
4. **Cancelar** interrompe a execução em andamento (TERM, escalando para KILL se não sair a tempo).
5. Reconectar à aba (reload, trocar de projeto e voltar) reanexa à execução em andamento — nada se perde.

## Como interpretar Test Intelligence

A recomendação é deliberadamente conservadora:

- **Testes direcionados encontrados** aparece somente quando **todo** arquivo alterado possui mapeamento direto para pelo menos um teste conhecido. A UI lista uma amostra dos testes encontrados e deixa explícito que isso não inicia execução automaticamente.
- **Suíte completa recomendada** aparece quando existe arquivo sem mapeamento, runner incompatível ou qualquer outra ausência de evidência suficiente.
- `unknown` não significa sucesso nem ausência de impacto; significa que o Dashboard não consegue provar um subconjunto seguro com o conhecimento atual.
- O bloco mostra branch base → branch atual para deixar claro qual comparação originou a sugestão.

A recomendação e a execução continuam separadas. Neste slice, clicar em **Executar suíte completa** mantém exatamente o lifecycle PTY existente; a sugestão não troca o comando nem dispara testes em background.

## Escopo atual

Ainda não fazem parte desta aba:

- **Executar um arquivo específico** ou um **caso/padrão de nome** dentro de um arquivo diretamente pela UI PTY atual.
- Botão **Rodar sugeridos** acoplado ao suggestion engine — a execução direcionada só deve ser integrada quando houver contrato explícito que preserve a diferença semântica entre targeted e full suite.
- **Histórico** de execuções anteriores persistente entre reinícios do dashboard.
- **Diagnóstico estruturado** (métricas de sucesso/falha, navegador de falhas, abas Erros/Avisos/Detalhes) — a saída agora é o terminal cru; classificação sobre esse texto ainda não foi reconstruída.

O histórico de mudanças desse fluxo permanece disponível no Git; novas capacidades devem reutilizar o mesmo contrato de PTY destacável e os limites de saída descritos acima.

## Como o dashboard detecta o comando de teste

Só reconhece um conjunto fechado de possibilidades — nunca aceita um comando digitado livremente:

- **Node**: procura scripts `test`, `test:unit` ou `test:ci` no `package.json` e identifica o runner (Vitest, Jest, ou o executor nativo `node --test`) pelo próprio script ou pelas dependências do projeto. Se não houver script configurado, tenta usar o binário do runner instalado localmente (`node_modules/.bin/vitest run` ou `.../jest --ci`).
- **Rails**: usa `bin/rspec`/`bundle exec rspec` quando RSpec é detectado; `bin/rails test`/`bundle exec rails test` para Minitest integrado ao Rails; ou `bundle exec rake test` para Minitest sem Rails.
- **Python**: só oferece `pytest` (sem argumentos extras) quando há um sinal explícito de que o projeto usa Pytest (arquivo `pytest.ini`, `conftest.py`, seção `[tool.pytest]` no `pyproject.toml`, ou `pytest` listado em algum `requirements*.txt`).

## Como funciona por trás

- `ProjectTestPtyService` (`apps/api/src/services/project-test-pty-service.ts`) resolve o comando via `testDetectionService.resolveCommand` e delega a `DetachableExecutionService` (`apps/api/src/services/detachable-execution-service.ts`), que spawna o comando num PTY sem atrelar o processo à conexão do navegador.
- O bloco Test Intelligence usa `GET /api/projects/:projectId/tests/:commandId/intelligence`. A resposta é descartada se o usuário trocar de projeto/comando antes da conclusão, evitando informação stale na recomendação.
- O suggestion engine não executa shell nem inicia testes; ele reutiliza a relação de testes conhecida pelo backend e retorna evidência estruturada.
- Só uma execução por projeto de cada vez (`POST /api/projects/:id/tests/pty/start` recusa uma segunda enquanto a primeira roda).
- `GET /api/projects/:id/tests/pty/connect` (WebSocket) é somente leitura — não aceita stdin, já que a suíte completa não é um comando interativo.
