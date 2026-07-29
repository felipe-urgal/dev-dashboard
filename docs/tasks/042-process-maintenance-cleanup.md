# Task 042 — manutenção de processos: limpeza de logs órfãos

## Status

Concluída (fatia de limpeza). `dev-kill-port` avaliado e adiado — ver
"Decisão sobre dev-kill-port" abaixo.

## Objetivo

Continuar a "paridade CLI→Web seletiva" do Horizonte 2 trazendo para a API
web a lacuna real deixada pelo `dev-clean` do CLI bash (`lib/server/core/commands.sh`)
que a varredura automática (`sweepStaleProcesses`) ainda não cobria: arquivos
de log órfãos, sem nenhum arquivo de estado correspondente no diretório
gerenciado.

## Escopo entregue

- `dev-clean` roda dois laços: um para PIDs órfãos (processo morto) e outro
  para logs antigos **sem arquivo de PID correspondente**. O
  `sweepStaleProcesses` existente (task 036) só cobria o equivalente ao
  primeiro laço — ele itera sobre os arquivos de estado (`*.server.json` /
  `*.test.json`) e remove o par estado+log quando o processo está em estado
  terminal e fora da janela de retenção (ou sempre, com
  `removeAllTerminal`). Um `.log` cujo `.json` já não existe (por exemplo,
  removido manualmente, ou remanescente de uma versão anterior do
  dashboard) nunca era alcançado.
- `packages/process-manager/src/log-retention.ts` ganhou `sweepOrphanLogs`,
  chamado ao final de `sweepStaleProcesses`: varre `logs/`, para cada
  `*.server.log` / `*.test.log` deriva o nome do arquivo de estado
  correspondente e verifica sua existência (`access`, sem validar o
  conteúdo — um estado corrompido ainda conta como "existe" e preserva o
  log). Sem correspondência, o log é órfão: removido imediatamente sob
  `removeAllTerminal`, ou apenas quando sua `mtime` ultrapassa a mesma
  janela de retenção usada para os demais estados terminais.
- `SweptProcess`/`SweptOrphanLog`/`SweptEntry` (novo tipo união) substituem
  o retorno antes fixo em `{ projectId }` — entradas de log órfão retornam
  `{ logFile }` (nome de arquivo, não caminho absoluto). `sweepStaleProcesses`
  agora retorna `SweptEntry[]`.
- `logRetentionSweepResponseSchema` (`apps/api/src/http/response-schemas.ts`)
  ajustado: `projectId` e `logFile` são ambos opcionais em cada item de
  `removed`, mantendo `additionalProperties: false`. Nenhuma rota nova: o
  `POST /api/processes/cleanup` existente (task 036) já expõe a limpeza
  ampliada, e a UI (`ProcessesView.vue`) já consome só `removedCount`, então
  nenhuma mudança de frontend foi necessária.

## Decisão sobre dev-kill-port

`dev-kill-port` do CLI mata **qualquer processo dono da porta** via
`lsof`/`fuser`, sem verificar se o PID pertence a um processo que o
dashboard iniciou. Isso conflita diretamente com "Identidade de processos"
em `docs/architecture/security.md`: um PID pode ser reutilizado, e antes de
encerrar é obrigatório comparar `/proc/<pid>/cwd` com o diretório esperado
do projeto — o que só é possível quando existe um `StoredProcess` rastreado
com aquele `cwd`. Um PID arbitrário dono de uma porta não tem essa
correspondência.

Por isso, tanto a mutação quanto uma eventual ação de diagnóstico (mostrar
PID/comando de processos externos que ocupam a porta) ficam fora desta
fatia: a primeira já estava listada como fora do escopo em `NEXT.md`; a
segunda exigiria escanear `/proc` do sistema todo por ocupantes de porta —
superfície nova e não relacionada aos projetos cadastrados, sem o mesmo
modelo de confirmação/autorização das demais ações do catálogo fechado.
Quando um servidor gerenciado falha ao iniciar por porta ocupada, a API já
responde com `PORT_NOT_AVAILABLE` (400) e a UI exibe a mensagem — suficiente
para o usuário liberar a porta manualmente fora do dashboard, mesmo caminho
que `dev-kill-port` cobriria sem o dashboard assumir o encerramento.

## Segurança

- A limpeza de logs órfãos continua restrita ao `logDirectory` do
  `stateDirectory` gerenciado; nenhum caminho vindo do navegador chega à
  varredura — `sweepOrphanLogs` só lista e remove dentro do diretório
  resolvido internamente pelo `ProcessManager`.
- Nenhum PID é tocado nesta fatia: a limpeza opera exclusivamente sobre
  arquivos de estado/log, nunca sinaliza processos.
- `dev-kill-port` permanece fora do catálogo fechado de mutações.

## Testes

- `packages/process-manager/test/log-retention.test.ts`: quatro novos
  casos — log órfão antigo removido, log órfão recente preservado, log
  órfão removido sob `removeAllTerminal`, e log preservado quando o estado
  correspondente existe (mesmo corrompido).
- `apps/api/test/process-cleanup.test.ts`: novo caso cobrindo
  `POST /api/processes/cleanup` removendo um log órfão e retornando
  `{ logFile }` sem `projectId`.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- `dev-kill-port` (mutação ou diagnóstico) — ver decisão acima.
- `git-pr` e snapshot/restore de banco — fatias próprias do mesmo item do
  roadmap, ainda pendentes.
- Qualquer alteração de UI: a limpeza ampliada reaproveita a ação
  "Limpar finalizados" existente (task 036) sem mudança de contrato visível
  para o frontend.
