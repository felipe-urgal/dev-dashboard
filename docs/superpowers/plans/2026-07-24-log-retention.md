# Limpeza e Retenção de Logs — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover automaticamente logs e estado de processos já parados (mais antigos que uma janela de retenção), tanto no `packages/process-manager` (TS) quanto no CLI bash (`dev-clean`), sem nunca tocar em processos ainda em execução.

**Architecture:** Uma função pura `sweepStaleProcesses(stateDirectory, options)` em um arquivo novo (`log-retention.ts`), separada da classe `ProcessManager` para ficar testável isoladamente; chamada automaticamente no início de `startServer()` (best-effort) e exposta via `POST /api/processes/cleanup`. Do lado bash, `dev-clean` ganha uma segunda varredura (logs sem `.pid` correspondente e antigos por `mtime`), chamada silenciosamente no início de `_dev_start_server`.

**Tech Stack:** TypeScript (Node.js, `node:test`, `node:assert/strict`, `tsx`), Fastify (JSON Schema), Bash 4+.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-24-log-retention-design.md` — qualquer dúvida de comportamento, essa é a fonte da verdade.
- Retenção padrão: **7 dias**, configurável via `DEV_DASHBOARD_LOG_RETENTION_DAYS` (valor inválido/não numérico cai no padrão).
- Elegível para remoção (lado TS) = status `stopped` ou `failed` **e** mais antigo que a janela — nunca remove um processo genuinamente em execução.
- Toda alteração de código de produção segue TDD: teste falhando primeiro, depois implementação mínima.
- Testes usam processos reais (sem mocks), seguindo o padrão já estabelecido em `packages/process-manager/test/process-manager.test.ts`.
- Toda documentação/comentário novo em PT-BR (convenção do repositório, ver `CLAUDE.md`).
- Commits: mensagem de uma linha só (preferência do usuário para este projeto).
- Ao final de cada task: `npm run typecheck` e a suíte de testes do pacote tocado devem passar.

---

### Task 1: Expor internals compartilhados de `ProcessManager`

**Files:**
- Modify: `packages/process-manager/src/process-manager.ts` (linhas ~29-34, ~307-330, ~377-395, ~417-427)
- Modify: `packages/process-manager/src/index.ts`

**Interfaces:**
- Produces: `export interface StoredProcess extends ManagedProcess { command: string; args: string[]; cwd: string; logPath: string; }`, `export function isStoredProcess(value: unknown): value is StoredProcess`, `export function isManagedProcessAlive(pid: number): boolean`, `export async function verifyProcessDirectory(storedProcess: StoredProcess): Promise<boolean>`, `public readonly stateDirectory: string` (no lugar de `private readonly stateDirectory: string`).

Esta task só amplia visibilidade de código já existente (nenhuma mudança de comportamento), então não tem um teste novo dedicado — o critério de sucesso é a suíte existente continuar 100% verde.

- [ ] **Step 1: Tornar `StoredProcess` e as funções auxiliares públicas**

Em `packages/process-manager/src/process-manager.ts`, altere:

```ts
interface StoredProcess extends ManagedProcess {
```
para:
```ts
export interface StoredProcess extends ManagedProcess {
```

```ts
function isStoredProcess(value: unknown): value is StoredProcess {
```
para:
```ts
export function isStoredProcess(value: unknown): value is StoredProcess {
```

```ts
function isManagedProcessAlive(pid: number): boolean {
```
para:
```ts
export function isManagedProcessAlive(pid: number): boolean {
```

```ts
async function verifyProcessDirectory(
  storedProcess: StoredProcess,
): Promise<boolean> {
```
para:
```ts
export async function verifyProcessDirectory(
  storedProcess: StoredProcess,
): Promise<boolean> {
```

- [ ] **Step 2: Tornar `stateDirectory` um campo público**

Em `packages/process-manager/src/process-manager.ts`, na classe `ProcessManager`:

```ts
export class ProcessManager {
  private readonly stateDirectory: string;
  private readonly processDirectory: string;
  private readonly logDirectory: string;
```
para:
```ts
export class ProcessManager {
  public readonly stateDirectory: string;
  private readonly processDirectory: string;
  private readonly logDirectory: string;
```

- [ ] **Step 3: Reexportar os novos símbolos em `index.ts`**

Substitua o conteúdo de `packages/process-manager/src/index.ts` por:

```ts
export {
  ProcessManager,
  ProcessManagerError,
  isManagedProcessAlive,
  isStoredProcess,
  verifyProcessDirectory,
} from './process-manager.js';

export type {
  ProcessManagerErrorCode,
  ReadServerLogOptions,
  StartServerOptions,
  StoredProcess,
} from './process-manager.js';
```

- [ ] **Step 4: Rodar a suíte existente para confirmar que nada quebrou**

Run: `cd packages/process-manager && npm run build && npm run typecheck && npm test`
Expected: build/typecheck sem erros; `tests 10`, `pass 10`, `fail 0` (mesmo resultado de antes, nenhuma mudança de comportamento).

- [ ] **Step 5: Commit**

```bash
git add packages/process-manager/src/process-manager.ts packages/process-manager/src/index.ts
git commit -m "refactor: expor internals do ProcessManager para reuso na limpeza de logs"
```

---

### Task 2: `sweepStaleProcesses` — remoção básica por idade

**Files:**
- Create: `packages/process-manager/src/log-retention.ts`
- Create: `packages/process-manager/test/log-retention.test.ts`

**Interfaces:**
- Consumes: `StoredProcess`, `isStoredProcess` de `./process-manager.js` (Task 1).
- Produces: `export interface SweepStaleProcessesOptions { maxAgeMs?: number; }`, `export interface SweptProcess { projectId: string; logPath: string; stateFilePath: string; }`, `export async function sweepStaleProcesses(stateDirectory: string, options?: SweepStaleProcessesOptions): Promise<SweptProcess[]>`.

- [ ] **Step 1: Escrever o teste falhando (processo parado antigo é removido)**

Crie `packages/process-manager/test/log-retention.test.ts`:

```ts
import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  utimes,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import path from "node:path";

import {
  test
} from "node:test";

import {
  sweepStaleProcesses
} from "../src/log-retention.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface Fixture {
  stateDirectory: string;
  processDirectory: string;
  cleanup: () => Promise<void>;
}

async function createFixture(): Promise<Fixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "dev-dashboard-log-retention-")
  );

  const stateDirectory = path.join(fixtureRoot, "state");
  const processDirectory = path.join(stateDirectory, "processes");

  await mkdir(processDirectory, { recursive: true });

  return {
    stateDirectory,
    processDirectory,
    cleanup: async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  };
}

async function writeStateFile(
  processDirectory: string,
  fileName: string,
  storedProcess: Record<string, unknown>
): Promise<{ stateFilePath: string; logPath: string }> {
  const stateFilePath = path.join(processDirectory, fileName);
  const logPath = path.join(processDirectory, `${fileName}.log`);

  await writeFile(logPath, "log de exemplo\n");
  await writeFile(stateFilePath, JSON.stringify(storedProcess));

  return { stateFilePath, logPath };
}

test(
  "removes a stopped process older than the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    const { stateFilePath, logPath } = await writeStateFile(
      fixture.processDirectory,
      "old.server.json",
      {
        id: "old:server",
        projectId: "old-project",
        kind: "server",
        status: "stopped",
        stoppedAt: eightDaysAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(fixture.processDirectory, "old.server.json.log")
      }
    );

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "old-project");

    await assert.rejects(stat(stateFilePath));
    await assert.rejects(stat(logPath));
  }
);
```

- [ ] **Step 2: Rodar o teste e confirmar que falha por falta de implementação**

Run: `cd packages/process-manager && node --import=tsx --test test/log-retention.test.ts`
Expected: FAIL — `Cannot find module '../src/log-retention.js'` (ainda não existe).

- [ ] **Step 3: Implementação mínima**

Crie `packages/process-manager/src/log-retention.ts`:

```ts
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { isStoredProcess, type StoredProcess } from './process-manager.js';

export interface SweepStaleProcessesOptions {
  maxAgeMs?: number;
}

export interface SweptProcess {
  projectId: string;
  logPath: string;
  stateFilePath: string;
}

const DEFAULT_RETENTION_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function resolveMaxAgeMs(options?: SweepStaleProcessesOptions): number {
  if (options?.maxAgeMs !== undefined) {
    return options.maxAgeMs;
  }

  const raw = process.env.DEV_DASHBOARD_LOG_RETENTION_DAYS;
  const parsedDays = raw !== undefined ? Number.parseInt(raw, 10) : NaN;

  const days =
    Number.isInteger(parsedDays) && parsedDays > 0
      ? parsedDays
      : DEFAULT_RETENTION_DAYS;

  return days * DAY_IN_MS;
}

async function isEligibleForRemoval(
  storedProcess: StoredProcess,
  stateFilePath: string,
  maxAgeMs: number,
): Promise<boolean> {
  if (
    storedProcess.status !== 'stopped' &&
    storedProcess.status !== 'failed'
  ) {
    return false;
  }

  const referenceTimestamp = storedProcess.stoppedAt
    ? new Date(storedProcess.stoppedAt).getTime()
    : (await stat(stateFilePath)).mtimeMs;

  return Date.now() - referenceTimestamp > maxAgeMs;
}

export async function sweepStaleProcesses(
  stateDirectory: string,
  options?: SweepStaleProcessesOptions,
): Promise<SweptProcess[]> {
  const maxAgeMs = resolveMaxAgeMs(options);
  const processDirectory = path.join(stateDirectory, 'processes');

  const entries = await readdir(processDirectory, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const swept: SweptProcess[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.server.json')) {
      continue;
    }

    const stateFilePath = path.join(processDirectory, entry.name);
    const contents = await readFile(stateFilePath, 'utf8');
    const parsed: unknown = JSON.parse(contents);

    if (!isStoredProcess(parsed)) {
      continue;
    }

    if (!(await isEligibleForRemoval(parsed, stateFilePath, maxAgeMs))) {
      continue;
    }

    await rm(stateFilePath, { force: true });
    await rm(parsed.logPath, { force: true });

    swept.push({
      projectId: parsed.projectId,
      logPath: parsed.logPath,
      stateFilePath,
    });
  }

  return swept;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd packages/process-manager && node --import=tsx --test test/log-retention.test.ts`
Expected: PASS — `tests 1`, `pass 1`.

- [ ] **Step 5: Adicionar os testes restantes de idade/mtime (mesmo arquivo)**

Acrescente ao final de `packages/process-manager/test/log-retention.test.ts`:

```ts
test(
  "keeps a stopped process within the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const oneDayAgo = new Date(Date.now() - DAY_IN_MS).toISOString();

    const { stateFilePath, logPath } = await writeStateFile(
      fixture.processDirectory,
      "recent.server.json",
      {
        id: "recent:server",
        projectId: "recent-project",
        kind: "server",
        status: "stopped",
        stoppedAt: oneDayAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "recent.server.json.log"
        )
      }
    );

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 0);
    await stat(stateFilePath);
    await stat(logPath);
  }
);

test(
  "removes a failed process older than the retention window",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    await writeStateFile(fixture.processDirectory, "failed.server.json", {
      id: "failed:server",
      projectId: "failed-project",
      kind: "server",
      status: "failed",
      stoppedAt: eightDaysAgo,
      command: "npm",
      args: ["run", "dev"],
      cwd: fixture.stateDirectory,
      logPath: path.join(
        fixture.processDirectory,
        "failed.server.json.log"
      )
    });

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "failed-project");
  }
);

test(
  "falls back to the state file's mtime when stoppedAt is missing",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const { stateFilePath } = await writeStateFile(
      fixture.processDirectory,
      "no-timestamp.server.json",
      {
        id: "no-timestamp:server",
        projectId: "no-timestamp-project",
        kind: "server",
        status: "stopped",
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "no-timestamp.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "no-timestamp-project");
  }
);

test(
  "returns an empty list when the processes directory does not exist",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-log-retention-empty-")
    );

    context.after(async () => {
      await rm(fixtureRoot, { recursive: true, force: true });
    });

    const removed = await sweepStaleProcesses(
      path.join(fixtureRoot, "state")
    );

    assert.deepEqual(removed, []);
  }
);
```

- [ ] **Step 6: Rodar todos os testes do arquivo e confirmar que passam**

Run: `cd packages/process-manager && node --import=tsx --test test/log-retention.test.ts`
Expected: PASS — `tests 5`, `pass 5`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add packages/process-manager/src/log-retention.ts packages/process-manager/test/log-retention.test.ts
git commit -m "feat: adicionar sweepStaleProcesses para remover logs antigos por idade"
```

---

### Task 3: `sweepStaleProcesses` — correção de processos "running" mortos

**Files:**
- Modify: `packages/process-manager/src/log-retention.ts`
- Modify: `packages/process-manager/test/log-retention.test.ts`

**Interfaces:**
- Consumes: `isManagedProcessAlive`, `verifyProcessDirectory` de `./process-manager.js` (Task 1).
- Produces: mesma assinatura pública de `sweepStaleProcesses` (Task 2) — apenas estende a elegibilidade.

- [ ] **Step 1: Escrever o teste falhando (processo "running" com PID morto é removido)**

No topo de `packages/process-manager/test/log-retention.test.ts`, junto aos imports existentes, adicione:

```ts
import { spawn } from "node:child_process";

import { realpath } from "node:fs/promises";
```

(a segunda linha deve ser mesclada ao import existente de `"node:fs/promises"` — o arquivo deve ficar com um único import desse módulo, incluindo `mkdir, mkdtemp, rm, stat, utimes, writeFile, realpath`)

Depois, acrescente ao final do arquivo:

```ts
function waitForExit(pid: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    const check = () => {
      try {
        process.kill(pid, 0);
      } catch {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        resolve();
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
}

test(
  "removes a process marked running whose PID has already died",
  async (context) => {
    const fixture = await createFixture();

    context.after(fixture.cleanup);

    const child = spawn("node", ["-e", "process.exit(0)"], {
      detached: true,
      stdio: "ignore"
    });

    const pid = child.pid;

    assert.ok(pid);

    child.unref();

    await waitForExit(pid as number, 2_000);

    const { stateFilePath } = await writeStateFile(
      fixture.processDirectory,
      "dead.server.json",
      {
        id: "dead:server",
        projectId: "dead-project",
        kind: "server",
        status: "running",
        pid,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixture.stateDirectory,
        logPath: path.join(
          fixture.processDirectory,
          "dead.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.projectId, "dead-project");
  }
);

test(
  "keeps a process that is genuinely running regardless of file age",
  async (context) => {
    const fixture = await createFixture();

    let pid: number | undefined;

    context.after(async () => {
      if (pid !== undefined) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // já encerrado
        }
      }

      await fixture.cleanup();
    });

    const projectCwd = await realpath(fixture.stateDirectory);

    const child = spawn(
      "node",
      ["-e", "setInterval(() => {}, 60000)"],
      {
        cwd: projectCwd,
        detached: true,
        stdio: "ignore"
      }
    );

    pid = child.pid;

    assert.ok(pid);

    child.unref();

    const { stateFilePath } = await writeStateFile(
      fixture.processDirectory,
      "alive.server.json",
      {
        id: "alive:server",
        projectId: "alive-project",
        kind: "server",
        status: "running",
        pid,
        command: "npm",
        args: ["run", "dev"],
        cwd: projectCwd,
        logPath: path.join(
          fixture.processDirectory,
          "alive.server.json.log"
        )
      }
    );

    const eightDaysAgo = new Date(Date.now() - 8 * DAY_IN_MS);

    await utimes(stateFilePath, eightDaysAgo, eightDaysAgo);

    const removed = await sweepStaleProcesses(fixture.stateDirectory, {
      maxAgeMs: 7 * DAY_IN_MS
    });

    assert.equal(removed.length, 0);
  }
);
```

- [ ] **Step 2: Rodar os dois testes novos e confirmar que falham**

Run: `cd packages/process-manager && node --import=tsx --test test/log-retention.test.ts`
Expected: FAIL nos dois testes novos — `isEligibleForRemoval` ainda não corrige status `running`, então nenhum dos dois é considerado elegível (o primeiro deveria ser removido e não é).

- [ ] **Step 3: Implementar a correção de aliveness**

Em `packages/process-manager/src/log-retention.ts`, troque o import e a função `isEligibleForRemoval`:

```ts
import {
  isManagedProcessAlive,
  isStoredProcess,
  verifyProcessDirectory,
  type StoredProcess,
} from './process-manager.js';
```

```ts
async function isEligibleForRemoval(
  storedProcess: StoredProcess,
  stateFilePath: string,
  maxAgeMs: number,
): Promise<boolean> {
  let status = storedProcess.status;

  if (
    status === 'running' ||
    status === 'starting' ||
    status === 'stopping'
  ) {
    const alive =
      storedProcess.pid !== undefined &&
      isManagedProcessAlive(storedProcess.pid) &&
      (await verifyProcessDirectory(storedProcess));

    status = alive ? status : 'stopped';
  }

  if (status !== 'stopped' && status !== 'failed') {
    return false;
  }

  const referenceTimestamp = storedProcess.stoppedAt
    ? new Date(storedProcess.stoppedAt).getTime()
    : (await stat(stateFilePath)).mtimeMs;

  return Date.now() - referenceTimestamp > maxAgeMs;
}
```

- [ ] **Step 4: Rodar todos os testes do arquivo e confirmar que passam**

Run: `cd packages/process-manager && node --import=tsx --test test/log-retention.test.ts`
Expected: PASS — `tests 7`, `pass 7`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/process-manager/src/log-retention.ts packages/process-manager/test/log-retention.test.ts
git commit -m "feat: corrigir processos running com PID morto antes de aplicar a retenção"
```

---

### Task 4: Integrar a varredura em `ProcessManager.startServer()`

**Files:**
- Modify: `packages/process-manager/src/process-manager.ts`
- Modify: `packages/process-manager/src/index.ts`
- Modify: `packages/process-manager/test/process-manager.test.ts`

**Interfaces:**
- Consumes: `sweepStaleProcesses` de `./log-retention.js` (Task 2/3).
- Produces: `sweepStaleProcesses`, `SweepStaleProcessesOptions`, `SweptProcess` reexportados por `@dev-dashboard/process-manager`.

- [ ] **Step 1: Escrever o teste falhando (start sobrevive a um arquivo de estado corrompido)**

Acrescente ao final de `packages/process-manager/test/process-manager.test.ts`:

```ts
test(
  "starts a server even when the log sweep finds a corrupted state file",
  async (context) => {
    const fixture = await createFixture({
      name: "fixture",
      scripts: { dev: "node -e \"setInterval(() => {}, 60000)\"" }
    });

    let startedPid: number | undefined;

    context.after(async () => {
      killIfAlive(startedPid);
      await fixture.cleanup();
    });

    const processDirectory = path.join(
      fixture.stateDirectory,
      "processes"
    );

    await mkdir(processDirectory, { recursive: true });

    await writeFile(
      path.join(processDirectory, "garbage.server.json"),
      "isto não é json{{{"
    );

    const started = await fixture.manager.startServer(fixture.project);

    startedPid = started.pid;

    assert.equal(started.status, "running");

    await fixture.manager.stopServer(fixture.project.id);
  }
);
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd packages/process-manager && node --import=tsx --test test/process-manager.test.ts`
Expected: FAIL — o `JSON.parse` do arquivo corrompido lança `SyntaxError`, que hoje se propaga para fora de `startServer()` e derruba o teste (o `await fixture.manager.startServer(...)` rejeita em vez de retornar `started`).

- [ ] **Step 3: Encapsular a varredura em `startServer()` de forma best-effort**

Em `packages/process-manager/src/process-manager.ts`, adicione o import:

```ts
import { sweepStaleProcesses } from './log-retention.js';
```

E no início do método `startServer`:

```ts
  public async startServer(
    project: Project,
    options: StartServerOptions = {},
  ): Promise<ManagedProcess> {
    try {
      await sweepStaleProcesses(this.stateDirectory);
    } catch {
      // A limpeza é best-effort: uma falha aqui nunca deve impedir o start.
    }

    const currentProcess = await this.getServerProcess(project.id);
```

(o restante do método permanece igual)

- [ ] **Step 4: Rodar a suíte completa do pacote e confirmar que passa**

Run: `cd packages/process-manager && node --import=tsx --test test/*.test.ts`
Expected: PASS — `tests 18`, `pass 18`, `fail 0` (10 de `process-manager.test.ts` + 1 novo + 7 de `log-retention.test.ts`).

- [ ] **Step 5: Reexportar `sweepStaleProcesses` no `index.ts` do pacote**

Em `packages/process-manager/src/index.ts`, adicione:

```ts
export { sweepStaleProcesses } from './log-retention.js';

export type {
  SweepStaleProcessesOptions,
  SweptProcess,
} from './log-retention.js';
```

- [ ] **Step 6: Rodar build + typecheck do pacote**

Run: `cd packages/process-manager && npm run build && npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add packages/process-manager/src/process-manager.ts packages/process-manager/src/index.ts packages/process-manager/test/process-manager.test.ts
git commit -m "feat: rodar a limpeza de logs automaticamente ao iniciar um servidor"
```

---

### Task 5: Rota `POST /api/processes/cleanup`

**Files:**
- Modify: `apps/api/src/http/response-schemas.ts`
- Modify: `apps/api/src/routes/processes.ts`
- Modify: `apps/api/test/routes.test.ts` (ou arquivo próprio — ver Step 1)

**Interfaces:**
- Consumes: `sweepStaleProcesses` de `@dev-dashboard/process-manager` (Task 4), `processManager.stateDirectory` (campo público desde a Task 1).
- Produces: rota `POST /projects` → não, produces a rota `POST /processes/cleanup` retornando `{ removed: SweptProcess[] }`.

- [ ] **Step 1: Escrever o teste falhando**

Crie `apps/api/test/process-cleanup.test.ts`:

```ts
import assert from "node:assert/strict";

import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import path from "node:path";

import {
  test
} from "node:test";

const TOKEN = "e".repeat(64);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

test(
  "POST /api/processes/cleanup removes stale process state and logs",
  async (context) => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "dev-dashboard-api-cleanup-")
    );

    const stateDirectory = path.join(fixtureRoot, "state");
    const processDirectory = path.join(stateDirectory, "processes");

    const previousStateDirectory =
      process.env.DEV_DASHBOARD_STATE_DIR;

    process.env.DEV_DASHBOARD_STATE_DIR = stateDirectory;

    await mkdir(processDirectory, { recursive: true });

    const eightDaysAgo = new Date(
      Date.now() - 8 * DAY_IN_MS
    ).toISOString();

    await writeFile(
      path.join(processDirectory, "stale.server.json"),
      JSON.stringify({
        id: "stale:server",
        projectId: "stale-project",
        kind: "server",
        status: "stopped",
        stoppedAt: eightDaysAgo,
        command: "npm",
        args: ["run", "dev"],
        cwd: fixtureRoot,
        logPath: path.join(processDirectory, "stale.server.json.log")
      })
    );

    await writeFile(
      path.join(processDirectory, "stale.server.json.log"),
      "log antigo\n"
    );

    const { buildApp } = await import("../src/app.js");

    const app = await buildApp({ localToken: TOKEN });

    context.after(async () => {
      await app.close();

      if (previousStateDirectory === undefined) {
        delete process.env.DEV_DASHBOARD_STATE_DIR;
      } else {
        process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
      }

      await rm(fixtureRoot, { recursive: true, force: true });
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/processes/cleanup",
      headers: { "x-dev-dashboard-token": TOKEN }
    });

    const body = response.json<{
      removed: Array<{ projectId: string }>;
    }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.removed.length, 1);
    assert.equal(body.removed[0]?.projectId, "stale-project");
  }
);
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && node --import=tsx --test test/process-cleanup.test.ts`
Expected: FAIL — `404` (a rota `POST /api/processes/cleanup` ainda não existe).

- [ ] **Step 3: Adicionar o schema de resposta**

Em `apps/api/src/http/response-schemas.ts`, adicione ao final do arquivo:

```ts
export const logRetentionSweepResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["removed"],
  properties: {
    removed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "logPath", "stateFilePath"],
        properties: {
          projectId: { type: "string" },
          logPath: { type: "string" },
          stateFilePath: { type: "string" }
        }
      }
    }
  }
} as const;
```

- [ ] **Step 4: Adicionar a rota**

Em `apps/api/src/routes/processes.ts`, adicione o import:

```ts
import { sweepStaleProcesses } from '@dev-dashboard/process-manager';

import { logRetentionSweepResponseSchema } from '../http/response-schemas.js';
```

E, dentro de `processRoutes` (após as demais rotas, antes do fechamento do plugin), adicione:

```ts
  app.post(
    '/processes/cleanup',
    {
      schema: {
        response: {
          200: logRetentionSweepResponseSchema,
        },
      },
    },
    async () => ({
      removed: await sweepStaleProcesses(processManager.stateDirectory),
    }),
  );
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd apps/api && node --import=tsx --test test/process-cleanup.test.ts`
Expected: PASS — `tests 1`, `pass 1`.

- [ ] **Step 6: Rodar a suíte completa de `apps/api`**

Run: `cd apps/api && node --import=tsx --test test/*.test.ts`
Expected: PASS — todos os testes (os já existentes + o novo), `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/http/response-schemas.ts apps/api/src/routes/processes.ts apps/api/test/process-cleanup.test.ts
git commit -m "feat: adicionar rota POST /api/processes/cleanup"
```

---

### Task 6: Estender `dev-clean` no CLI bash

**Files:**
- Modify: `lib/server/core/commands.sh`
- Modify: `lib/server/core/start.sh`

**Interfaces:**
- Nenhuma interface TS envolvida — funções shell chamadas por nome (`dev-clean`, `_dev_start_server`), como já é o padrão do restante do CLI.

Não há suíte automatizada para o CLI bash neste repositório (ver `CLAUDE.md`); a verificação desta task é manual, com comandos e saída esperada exatos.

- [ ] **Step 1: Estender `dev-clean` para também varrer logs antigos**

Em `lib/server/core/commands.sh`, substitua a função `dev-clean` inteira por:

```bash
dev-clean() {
  local quiet=false
  [[ "$1" == "--quiet" ]] && quiet=true

  local cleaned=0
  local retention_days="${DEV_DASHBOARD_LOG_RETENTION_DAYS:-7}"
  [[ "$retention_days" =~ ^[0-9]+$ ]] || retention_days=7

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

  if [ $cleaned -eq 0 ] && ! $quiet; then
    _dev_ok "Nenhum PID ou log obsoleto encontrado."
  fi
}
```

- [ ] **Step 2: Chamar `dev-clean --quiet` no início de `_dev_start_server`**

Em `lib/server/core/start.sh`, logo após a linha `_dev_start_server() {`, adicione:

```bash
_dev_start_server() {
  dev-clean --quiet

  local project="$1"
```

(o restante da função permanece igual — apenas a chamada a `dev-clean --quiet` é inserida antes da primeira linha existente)

- [ ] **Step 3: Verificação manual — PIDs e logs órfãos continuam sendo limpos**

Run:
```bash
mkdir -p /tmp/dev-clean-manual-test
DEV_RUN_DIR=/tmp/dev-clean-manual-test
export DEV_RUN_DIR
echo 999999 > "$DEV_RUN_DIR/fake.pid"
echo "log de teste" > "$DEV_RUN_DIR/fake.log"
touch -d "10 days ago" "$DEV_RUN_DIR/fake.log"
source ~/.dev-dashboard/init.sh
dev-clean
ls "$DEV_RUN_DIR"
```
Expected: as duas linhas `Removido PID órfão: fake.pid` e `Removido log antigo: fake.log` aparecem, e `ls "$DEV_RUN_DIR"` não lista mais nenhum dos dois arquivos (diretório vazio).

- [ ] **Step 4: Verificação manual — log de um processo ainda com `.pid` não é removido**

Run:
```bash
rm -rf /tmp/dev-clean-manual-test && mkdir -p /tmp/dev-clean-manual-test
DEV_RUN_DIR=/tmp/dev-clean-manual-test
export DEV_RUN_DIR
echo $$ > "$DEV_RUN_DIR/running.pid"
echo "log ativo" > "$DEV_RUN_DIR/running.log"
touch -d "30 days ago" "$DEV_RUN_DIR/running.log"
source ~/.dev-dashboard/init.sh
dev-clean
ls "$DEV_RUN_DIR"
```
Expected: `Nenhum PID ou log obsoleto encontrado.` — `running.pid` (PID do shell atual, vivo) e `running.log` continuam listados por `ls`, mesmo com 30 dias de idade, porque o `.pid` correspondente ainda existe e está vivo.

- [ ] **Step 5: Verificação manual — `--quiet` não imprime a mensagem de "nada encontrado"**

Run:
```bash
rm -rf /tmp/dev-clean-manual-test && mkdir -p /tmp/dev-clean-manual-test
DEV_RUN_DIR=/tmp/dev-clean-manual-test
export DEV_RUN_DIR
source ~/.dev-dashboard/init.sh
dev-clean --quiet
```
Expected: nenhuma saída no terminal (diretório já estava vazio, e o modo `--quiet` suprime a mensagem de sucesso).

- [ ] **Step 6: Limpar o diretório de teste manual**

Run: `rm -rf /tmp/dev-clean-manual-test`
Expected: sem saída.

- [ ] **Step 7: Commit**

```bash
git add lib/server/core/commands.sh lib/server/core/start.sh
git commit -m "feat: dev-clean tambem remove logs antigos, chamado automaticamente ao iniciar um servidor"
```

---

### Task 7: Atualizar o roadmap e validar o repositório inteiro

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Marcar o item concluído**

Em `docs/roadmap.md`, na Fase 1, altere:
```
- [ ] limpeza e retenção de logs;
```
para:
```
- [x] limpeza e retenção de logs;
```

- [ ] **Step 2: Rodar a validação completa do repositório**

Run: `cd /home/ubunru/.dev-dashboard && npm run typecheck && npm run build && npm test`
Expected: as três etapas terminam sem erro; a suíte de testes mostra `pass` para todos os workspaces (`api`, `core`, `process-manager`, `project-discovery`), `fail 0` em cada um.

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: marcar limpeza e retenção de logs como concluída no roadmap"
```

- [ ] **Step 4: Push**

Run: `git push`
Expected: push aceito sem conflitos para `feat/api-response-schemas`.
