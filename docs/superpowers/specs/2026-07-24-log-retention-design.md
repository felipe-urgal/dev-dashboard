# Limpeza e retenção de logs — design

Data: 2026-07-24
Status: aprovado, aguardando plano de implementação
Item do roadmap: `docs/roadmap.md`, Fase 1, "limpeza e retenção de logs"

## Contexto

Nem o CLI bash (`lib/server/core/commands.sh`, `dev-clean`) nem o novo
`packages/process-manager` (TS) removem ou limitam logs de processos parados.
`dev-clean` hoje só remove arquivos `.pid` órfãos — nunca toca em `.log`. O
lado TS não tem nenhuma rotina de limpeza. `docs/architecture/security.md` já
sinalizava isso como lacuna conhecida ("retenção configurável; limpeza
segura").

## Escopo

- **Inclui:** os dois lados — `packages/process-manager` (TS/API) e o CLI
  bash (`dev-clean`).
- **Tipo de limpeza:** só remoção de logs/estado de processos **já parados**
  e mais antigos que o limite de retenção. Não inclui rotação/truncamento de
  logs de processos ainda em execução (fica fora de escopo — decisão
  explícita para manter o trabalho focado).
- **Não inclui:** limite por tamanho total ou por contagem de arquivos;
  interface no Vue (não há tela de configurações/logs ainda — isso é Fase 2+
  do roadmap).

## Lado TS (`packages/process-manager`)

Novo arquivo `packages/process-manager/src/log-retention.ts`, com uma função
pura e testável isoladamente (não um método da classe `ProcessManager`, para
manter a responsabilidade de gerenciar processos separada da política de
retenção):

```ts
export interface SweepStaleProcessesOptions {
  maxAgeMs?: number; // padrão: 7 dias, ou DEV_DASHBOARD_LOG_RETENTION_DAYS
}

export interface SweptProcess {
  projectId: string;
  logPath: string;
  stateFilePath: string;
}

export async function sweepStaleProcesses(
  stateDirectory: string,
  options?: SweepStaleProcessesOptions,
): Promise<SweptProcess[]>
```

Comportamento:

1. Lê todos os `*.server.json` em `<stateDirectory>/processes/`.
2. Para cada um, reaproveita a mesma verificação de vida que
   `ProcessManager.getServerProcess` já usa (`isManagedProcessAlive` +
   `verifyProcessDirectory`): se o status salvo é `running`/`starting`/
   `stopping` mas o PID já morreu, trata como parado para fins de elegibilidade
   (sem depender de alguém ter consultado aquele processo específico antes).
3. Elegível para remoção = está parado — `status` é `stopped` ou `failed`
   (já era, ou acabou de ser tratado como tal no passo 2) — **e** `stoppedAt`
   mais antigo que `maxAgeMs`. Quando `stoppedAt` está ausente (estado
   corrompido ou nunca chegou a rodar), usa o `mtime` do próprio arquivo
   `.server.json` como fallback.
4. Remove o `.server.json` e o `.server.log` correspondente; erros `ENOENT`
   ao remover o log (já não existe) são ignorados.
5. Retorna a lista do que foi removido, para logging e para a resposta da
   rota da API.

Wiring:

- `ProcessManager.startServer()` chama `sweepStaleProcesses(this.stateDirectory)`
  no início, de forma best-effort: uma falha na varredura (ex. permissão de
  diretório) é capturada e ignorada — nunca deve impedir o start do servidor.
- Nova rota `POST /api/processes/cleanup` em `apps/api/src/routes/processes.ts`,
  chamando a mesma função diretamente, protegida pelo mesmo token/CORS das
  demais rotas privadas, com schema de resposta próprio em
  `apps/api/src/http/response-schemas.ts` (`{ removed: [...] }`).
- `DEV_DASHBOARD_LOG_RETENTION_DAYS` (padrão `7`) lido do ambiente no ponto de
  chamada, mesmo padrão de `DEV_DASHBOARD_STATE_DIR`/`DEV_DASHBOARD_CONFIG_DIR`
  já usados no projeto. Um valor inválido (não numérico) cai no padrão de 7
  dias em vez de quebrar.

## Lado bash (`lib/server/core`)

Estende `dev-clean` (`lib/server/core/commands.sh`) para, além do
comportamento atual (remover `.pid` órfãos, inalterado), também varrer logs
antigos:

```bash
dev-clean() {
  local cleaned=0
  local retention_days="${DEV_DASHBOARD_LOG_RETENTION_DAYS:-7}"

  # comportamento atual: PIDs órfãos (inalterado)
  local pid_file
  for pid_file in "$DEV_RUN_DIR"/*.pid; do
    [ -f "$pid_file" ] || continue
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      _dev_warn "Removido PID órfão: $(basename "$pid_file")"
      ((cleaned++))
    fi
  done

  # novo: logs sem .pid correspondente e mais antigos que o limite
  local log_file
  for log_file in "$DEV_RUN_DIR"/*.log; do
    [ -f "$log_file" ] || continue
    local id
    id=$(basename "$log_file" .log)
    local pid_file="$DEV_RUN_DIR/${id}.pid"
    [ -f "$pid_file" ] && continue
    if [ -z "$(find "$log_file" -mtime "+${retention_days}" 2>/dev/null)" ]; then
      continue
    fi
    rm -f "$log_file"
    _dev_warn "Removido log antigo: $(basename "$log_file")"
    ((cleaned++))
  done

  [ $cleaned -eq 0 ] && _dev_ok "Nenhum PID ou log obsoleto encontrado."
}
```

Pontos importantes:

- A regra de elegibilidade no bash é **"sem `.pid` correspondente"**, não
  "PID morto" — porque se o `.pid` ainda existisse mas estivesse morto, o
  próprio loop de PIDs órfãos já o teria removido nesta mesma execução de
  `dev-clean`, então na varredura de logs ele já não existe mais. Um servidor
  **rodando** sempre tem `.pid` presente, então seu log nunca é elegível.
- Não há timestamp de quando um processo parou no formato de estado do bash
  (só o PID no arquivo) — por isso a idade usa o `mtime` do próprio arquivo
  `.log`. Assimetria aceita em relação ao `stoppedAt` preciso do lado TS: não
  há informação melhor disponível sem redesenhar o formato de estado do bash.
- Webpack (`webpack-<id>.pid`) segue a mesma regra automaticamente, já que o
  loop de PIDs órfãos já é genérico por `*.pid`.
- **Gatilho automático**: chamada a `dev-clean` (silenciosa, sem os avisos de
  "nenhum encontrado") no início de `_dev_start_server`
  (`lib/server/core/start.sh`), espelhando o `startServer()` do TS.

## Testes

**TS** (`packages/process-manager/test/log-retention.test.ts`, mesmas
fixtures reais em tmpdir da suíte `process-manager.test.ts`, sem mocks):

- remove `.server.json` + `.server.log` de um processo `stopped` com
  `stoppedAt` mais antigo que o limite;
- remove também um processo `failed` nas mesmas condições;
- não remove um processo `stopped` recente (dentro do limite);
- não remove um processo `running` de verdade (sobe um processo real curto);
- corrige e remove um processo marcado `running` no arquivo mas cujo PID já
  morreu (caso mais importante — motivo de reaproveitar a checagem de vida de
  `getServerProcess`);
- usa `mtime` do `.server.json` como fallback quando `stoppedAt` está
  ausente;
- `startServer()` continua funcionando mesmo se a varredura falhar (ex.
  diretório sem permissão de leitura) — o erro não deve propagar.

**Rota da API** (`apps/api/test/`, estendendo o padrão já existente):
`POST /api/processes/cleanup` retorna `{ removed: [...] }` com schema de
resposta próprio, protegido pelo mesmo token/CORS das demais rotas.

**Bash**: sem suíte automatizada (este repositório não tem testes
automatizados para o próprio CLI bash, só menus para rodar os testes *do
projeto gerenciado* — ver `CLAUDE.md`). Verificação manual com fixtures de
`.pid`/`.log` num `$DEV_RUN_DIR` de teste.

## Casos de borda cobertos

- diretório de processos/logs inexistente (primeira execução, nada a
  limpar);
- log sem `.server.json` correspondente e vice-versa (arquivo órfão de
  verdade);
- `DEV_DASHBOARD_LOG_RETENTION_DAYS` inválido (não numérico) cai no padrão de
  7 dias em vez de quebrar.

## Fora de escopo (explicitamente adiado)

- Rotação/truncamento de logs de processos em execução por tamanho.
- Limite por tamanho total do diretório de logs ou por contagem de arquivos.
- Qualquer interface no Vue para configurar ou disparar a limpeza
  manualmente (aguarda a tela de configurações da Fase 2 do roadmap).
