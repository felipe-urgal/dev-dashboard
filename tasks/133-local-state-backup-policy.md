# Task 133 — Política de migração e backup do estado local

## Contexto

Último item da seção "Distribuição, governança e compatibilidade" em
`tasks/PENDENCIAS.md`: "Criar uma política versionada de migração e backup
do estado local." Como a task 132, pedia uma decisão de escopo antes de
uma feature concreta existir.

Investigação do estado local hoje espalhado entre CLI bash e dashboard
web:

| Local | Dono | Conteúdo | Sensível? |
|---|---|---|---|
| `~/.config/dev-dashboard/*.json` | web | workspaces, favoritos, perfis de ambiente, retenção | não |
| `~/.config/dev-dashboard/api-token` | web | token de autenticação da API | sim — nunca deve ser copiado entre máquinas |
| `~/.local/state/dev-dashboard/**` | web | histórico de testes/cobertura/mutações Git | não |
| `~/.dev-dashboard.secrets` | CLI bash | variáveis de ambiente/segredos do usuário | sim |
| `config/projects.conf` | CLI bash | overrides de porta por projeto | não — já versionado em git, fora de escopo |
| `$DEV_RUN_DIR` (`/tmp/dev-dashboard-$UID`) | ambos | PIDs/logs de processos em execução | efêmero — nunca deve ser copiado entre máquinas |

Cada arquivo JSON de estado (`packages/core`) já tem um campo `version: 1`,
mas quando `version` não bate o repository descartava o arquivo
silenciosamente (favoritos/perfis/recents/retention) ou, no caso de
`WorkspaceRepository`, lançava e propagava o erro para quem chamasse
`list()`/etc. — nenhum dos dois comportamentos é seguro: o primeiro perde
configuração do usuário sem aviso, o segundo faz toda rota relacionada a
workspaces retornar 500 até o usuário apagar o arquivo manualmente.

## Decisão

Confirmado com o usuário, em duas decisões de escopo:

1. **Comando novo no CLI** (`dev-backup`/`dev-restore`), não só
   documentação — empacota/restaura o estado num `.tar.gz` portátil.
2. **Corrigir a perda silenciosa de dados em mismatch de versão**: em vez
   de descartar (ou, no caso do workspace, lançar), cada repository agora
   guarda uma cópia do arquivo original ao lado (`<arquivo>.unreadable-<timestamp>.bak`)
   e emite um aviso antes de recriar com os valores padrão — sem lógica de
   migração automática entre versões (não há `version: 2` ainda), só evita
   perda silenciosa.

## Implementação

### `dev-backup` / `dev-restore` (`lib/backup/`)

- `dev-backup [--include-secrets]`: empacota
  `~/.config/dev-dashboard` (sem `api-token`) e
  `~/.local/state/dev-dashboard` num `.tar.gz` timestamped em
  `~/.dev-dashboard-backups` (`DEV_DASHBOARD_BACKUP_DIR` para
  sobrescrever), permissões `0700`/`0600`. O token da API nunca é incluído
  — é regenerado automaticamente pela API; `~/.dev-dashboard.secrets` só
  entra com a flag explícita.
- `dev-restore <arquivo.tar.gz>`: valida a estrutura do arquivo (precisa
  ter `config/` e/ou `state/`), pede confirmação (gum ou `read -r -p`,
  mesmo padrão de `dev-node-deps`) antes de sobrescrever, e lembra o
  usuário de que um token novo será gerado automaticamente.
- Segue a mesma convenção de três arquivos dos demais módulos
  (`init.sh`/`helpers.sh`/`run.sh`), carregado como submódulo opcional em
  `init.sh` (seção 7, ao lado de git/rails/node).

### Quarentena em mismatch de versão (`packages/core`)

- `packages/core/src/state-file-recovery.ts` (novo):
  `quarantineUnreadableStateFile(filePath)` — copia o arquivo original
  para `<filePath>.unreadable-<timestamp>.bak` e emite `console.warn`; é
  um no-op quando o arquivo não existe (primeira execução, caso normal,
  não um erro). `isFileNotFoundError(error)` compartilhado, substituindo
  os checks locais duplicados em `workspace-repository.ts`.
- As cinco repositories (`workspace-repository.ts`,
  `environment-profile-repository.ts`, `project-favorite-repository.ts`,
  `project-recent-repository.ts`, `retention-settings-repository.ts`)
  passam a chamar `quarantineUnreadableStateFile` no `catch` antes de
  recriar o arquivo com os valores padrão, exceto quando o erro é
  `ENOENT` (arquivo ausente). `WorkspaceRepository.readConfig()` não lança
  mais para chamadores — degrada para lista vazia como os demais, mesmo
  comportamento uniforme nos cinco.

## Fora de escopo (decisão explícita)

- Migração automática entre versões de schema — não há `version: 2` ainda;
  quando existir, a lógica de migração propriamente dita é um item novo.
- Backup de `config/projects.conf` — já versionado em git, fora do
  `dev-backup`.
- Backup/restore de `$DEV_RUN_DIR` — estado efêmero, nunca deve ser
  copiado entre máquinas (PIDs de outra máquina não fazem sentido).
- Criptografia do `.tar.gz` — protegido só por permissão `0600`; com
  `--include-secrets`, o arquivo contém segredos em texto plano.

## Arquivos

- `lib/backup/init.sh`, `lib/backup/helpers.sh`, `lib/backup/run.sh`
  (novos); `init.sh` (raiz) carrega o módulo; `lib/doctor/help.sh`
  documenta os dois comandos.
- `packages/core/src/state-file-recovery.ts` (novo);
  `workspace-repository.ts`, `environment-profile-repository.ts`,
  `project-favorite-repository.ts`, `project-recent-repository.ts`,
  `retention-settings-repository.ts` (usam o helper).
- `docs/architecture/security.md` (seção "Backup e restauração do estado
  local (CLI)"), `docs/operations-and-troubleshooting.md`
  (`DEV_DASHBOARD_BACKUP_DIR`, seção "Backup e restauração").
- Testes novos: `tests/cli/cases/07-backup.sh` (18 casos: helpers,
  backup sem estado, backup com config+state, token nunca incluído,
  restore sem argumento, restore recusado, restore confirmado, arquivo
  inválido rejeitado, `--include-secrets`), `packages/core/test/state-file-recovery.test.ts`,
  mais regressão em `packages/core/test/workspace-repository.test.ts`
  (config corrompido/versão futura não derruba mais o repository).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
tests/cli/run.sh
```

Todos passando (601 testes na API, 372 no web, 20 no core, 51 no
process-manager, 55 no CLI bash — 18 novos de `07-backup.sh`); nenhuma
rota HTTP mudou, `docs/architecture/api-reference.md` continua com 156
rotas. Testado manualmente também o fluxo completo de `dev-backup` num
`HOME` isolado, confirmando permissões `0700`/`0600` e que o token nunca
aparece no arquivo.
