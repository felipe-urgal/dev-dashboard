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

- [ ] Executar caso/`describe` específico para os runners Node (`node --test`,
  Jest, Vitest) via `-t`/`--test-name-pattern` — RSpec já foi entregue na
  task 123 (`arquivo:linha`, sem precisar de parser/AST); os runners Node
  usam padrão de nome, não linha, e a UI precisaria descobrir esses nomes
  (hoje só lista arquivos, sem outline de `describe`/`it`) ou aceitar que o
  usuário digite o padrão à mão — decisão de UX em aberto antes de
  implementar.
- [ ] Persistir relatórios de cobertura de projetos gerenciados (não deste
  codebase) — funcionalidade nova, sem nenhuma base hoje; formatos
  completamente diferentes por ecossistema (LCOV/JSON de Istanbul/c8/nyc vs.
  `.resultset.json`+HTML do SimpleCov/Rails), cada um exigindo parser
  próprio.

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Distribuição, governança e compatibilidade

- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Validar e implementar compatibilidade com macOS (a matriz de suporte
  atual, publicada na task 113, já documenta o que é tratado hoje no CLI
  bash e o que falta: cobertura de teste dedicada e identidade de processo
  equivalente ao `/proc/<pid>/cwd` no dashboard web).
