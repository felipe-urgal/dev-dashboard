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

- [ ] Persistir relatórios de cobertura de projetos gerenciados para
  ecossistemas além do Node/Istanbul já entregue na task 128 — SimpleCov
  (Rails), que usa `coverage/.resultset.json`, um formato completamente
  diferente do Istanbul, exigindo parser próprio. A task 128 também deixou
  de escopo, deliberadamente: histórico entre execuções (só o relatório
  mais recente é lido, sem persistência própria) e
  `coverage-summary.json` pré-calculado (só `coverage-final.json` bruto é
  suportado hoje).

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Distribuição, governança e compatibilidade

- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Validar e implementar compatibilidade com macOS (a matriz de suporte
  atual, publicada na task 113, já documenta o que é tratado hoje no CLI
  bash e o que falta: cobertura de teste dedicada e identidade de processo
  equivalente ao `/proc/<pid>/cwd` no dashboard web).
