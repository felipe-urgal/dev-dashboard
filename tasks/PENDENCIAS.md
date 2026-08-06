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

- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura — dividir em entregas separadas antes de implementar, porque os
  runners e formatos de relatório diferem.
- [ ] Expor ações mutáveis do GitHub CLI (`gh pr create`/`merge`/`close`) no
  dashboard web — o modelo de autorização já foi definido e documentado na
  task 114 (`docs/architecture/security.md`, "Integração com o GitHub CLI");
  falta o catálogo fechado de subcomandos e o fluxo de confirmação em duas
  etapas descritos lá. Sem essa entrega, `gh` continua só leitura (fallback
  já em produção para status/CI de PR).

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Qualidade e manutenção

- [ ] Medir cobertura e definir metas por camada.

Esses itens não formam uma única frente coerente: cada um deve ganhar uma
task própria quando houver motivação, escopo e critério de saída concretos.

## Distribuição, governança e compatibilidade

- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Validar e implementar compatibilidade com macOS (a matriz de suporte
  atual, publicada na task 113, já documenta o que é tratado hoje no CLI
  bash e o que falta: cobertura de teste dedicada e identidade de processo
  equivalente ao `/proc/<pid>/cwd` no dashboard web).
