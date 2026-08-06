# Atividades pendentes

Inventário do que ainda falta implementar no Dev Dashboard. Este documento
lista só trabalho em aberto; itens concluídos ficam registrados em
`tasks/<NNN>-*.md` — `docs/` guarda apenas documentação viva do produto, não
o histórico de entregas.

## Regras para qualquer entrega

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catálogo fechado de ações, receber apenas IDs e
valores validados do navegador e preservar schemas explícitos de resposta.

Antes de concluir uma entrega:

```bash
npm run typecheck
npm run build
npm test
```

## Assistente de IA e IDE embutida — candidatos ainda sem plano detalhado

- Smoke E2E dedicado para `propose_workspace_edit` e para as ferramentas de
  símbolo (já cobertos por testes de unidade; estender o double do Ollama
  para emitir os `tool_calls` correspondentes fica como possibilidade futura,
  não bloqueante).

## Produto e fluxos operacionais

- [ ] Persistir relatórios de cobertura de projetos gerenciados (não deste
  codebase) — funcionalidade nova, sem nenhuma base hoje; formatos
  completamente diferentes por ecossistema (LCOV/JSON de Istanbul/c8/nyc vs.
  `.resultset.json`+HTML do SimpleCov/Rails), cada um exigindo parser
  próprio.
- [ ] `ProcessManager.stopTest`/`startManagedTest` (`packages/process-manager`):
  encontrado durante a task 127 um caso em que parar um processo de teste que
  já saiu sozinho muito rápido (ex. `npm run test` falhando na primeira
  invocação) retorna um erro genérico (500 `BAD_REQUEST`, não um
  `ProcessManagerError` reconhecido) em vez de tratar como "já parado", e a
  tentativa de iniciar um novo processo de teste logo em seguida pode ver
  `PROCESS_ALREADY_RUNNING` mesmo com o processo anterior já morto —
  provável corrida entre a saída real do processo e a leitura/escrita do
  registro de status. Contornado nos testes (evitando reiniciar o mesmo
  processo de teste em sequência rápida na mesma fixture), não corrigido no
  serviço em si — precisa de investigação própria em
  `packages/process-manager/src/process-lifecycle.ts`
  (`stopManagedProcess`/`startManagedTest`).

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Distribuição, governança e compatibilidade

- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Validar e implementar compatibilidade com macOS (a matriz de suporte
  atual, publicada na task 113, já documenta o que é tratado hoje no CLI
  bash e o que falta: cobertura de teste dedicada e identidade de processo
  equivalente ao `/proc/<pid>/cwd` no dashboard web).
