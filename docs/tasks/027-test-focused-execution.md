# Task 027 — Testes de arquivo específico

## Status

Concluída.

## Objetivo

Permitir executar um arquivo de teste específico reconhecido pela detecção
existente, com o mesmo padrão de segurança do catálogo de scripts: catálogo
fechado, sem shell arbitrário, execução cancelável, logs limitados e
mascarados.

## Escopo entregue

- `ProjectTestCommand` ganhou `supportsFileTarget: boolean`, verdadeiro para
  `vitest`, `jest`, `node-test`, `rspec`, `rails-test` e `pytest` — `minitest`
  (via `rake test`) fica de fora por não ter uma forma simples de direcionar
  um arquivo único pela CLI.
- `TestDetectionService.listTestFiles` escaneia o diretório do projeto
  (limitado a 500 arquivos e profundidade 8, ignorando `node_modules`,
  `.git`, `dist`, `coverage`, `vendor`, etc.) usando um padrão de nome de
  arquivo por runner (`*.test.ts`/`*.spec.ts` para a família Node, `*_spec.rb`
  para RSpec, `*_test.rb` para Rails Test, `test_*.py`/`*_test.py` para
  pytest).
- `TestDetectionService.resolveFileCommand` valida o caminho contra o
  diretório do projeto (mesma técnica de `ensurePathInsideProject` usada no
  diff Git da task 015) e contra o padrão do runner, depois compõe o comando
  reaproveitando o resolvido pela detecção — para invocações via script de
  package manager (`npm run test`), insere `--` antes do caminho para
  repassar o argumento ao script real.
- Reaproveita o motor de execução já existente para o catálogo de testes
  (`ProcessManager.startTest`) em vez de duplicar um executor: a execução de
  um arquivo específico ocupa o mesmo "slot" de teste do projeto que a suíte
  inteira, então as duas não rodam simultaneamente — mesma trava, cancelamento
  e limite de log de sempre.
- Rotas `GET /projects/:projectId/tests/:commandId/files` e
  `POST /projects/:projectId/tests/:commandId/files/start`.
- Painel de testes do detalhe do projeto ganhou, por comando que suporta
  arquivo específico, um seletor com a lista de arquivos elegíveis e um botão
  para executar o escolhido.
- Testes de serviço (composição do comando por runner, rejeição de path fora
  do projeto, rejeição de arquivo fora do padrão esperado, runner sem
  suporte), testes de rota, e testes montados do painel.

## Decisões e limitações

Nenhuma sintaxe de caso/describe é suportada nesta entrega — só o arquivo
inteiro. `minitest` via `rake test` foi excluído por não ter forma simples de
direcionar um único arquivo sem reescrever a invocação do Rake.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Relatório de cobertura.
- Histórico persistente e eventos SSE para execuções de teste — a infra já
  existe para o catálogo de scripts; migrar/generalizar é decisão
  arquitetural própria.
- Sintaxe de caso/describe para qualquer runner.
- Watch mode ou execução contínua.
