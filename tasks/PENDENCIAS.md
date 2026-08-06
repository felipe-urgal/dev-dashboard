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

Nenhum item está registrado como pendente no momento. Os últimos três itens
desta lista (migração automática de schema, validação em macOS real, smoke
E2E de tool-calling do assistente de IA) foram resolvidos ou removidos por
decisão explícita do usuário — os dois primeiros seguem bloqueados por
pré-condições que ainda não existem (nenhum `version: 2` real, sem acesso a
uma máquina macOS neste ambiente) e podem ser reabertos quando essas
pré-condições mudarem; ver `tasks/133-local-state-backup-policy.md` e
`tasks/134-macos-process-identity.md` para o contexto de cada um.
