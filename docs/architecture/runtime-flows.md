# Fluxos de execução

Esta página resume os principais fluxos runtime do Dev Dashboard e os controles que precisam permanecer presentes. Ela descreve o estado atual; planejamento futuro permanece em issues.

## Inicialização de desenvolvimento

```text
npm run dev
        ↓
predev compila packages/*
        ↓
scripts/dev.mjs carrega .env.local quando existir
        ↓
API Fastify :4343 + Vite :5174
        ↓
um filho encerra inesperadamente
        ↓
orquestrador encerra os demais
```

No Linux, filhos usam grupos próprios. Shutdown envia `SIGTERM` e só escala para `SIGKILL` após a janela de tolerância.

`.env.local` é configuração local do Dev Dashboard. Integrações como Vercel podem receber `VERCEL_TOKEN`/`VERCEL_TEAM_ID` sem versionar segredo.

## Inicialização permanente no Linux

```text
npm run local:install
        ↓
build da distribuição
        ↓
unit + metadados privados
        ↓
systemctl --user daemon-reload
        ↓
enable dev-dashboard.service
        ↓
restart dev-dashboard.service
        ↓
aguardar /api/health
        ↓
sucesso somente com API saudável
```

A URL instalada padrão é `http://dev-dashboard.localhost:4343`, mas o listener continua em `127.0.0.1:4343`.

Reinstalação não usa apenas `enable --now`: o processo existente é reiniciado explicitamente para que HTML/assets/build e processo em memória correspondam à mesma revision.

## Inicialização da API

```text
server.ts
  ↓
buildApp()
  ↓
Fastify + WebSocket + segurança local
  ↓
createAppContext()
  ├── foundation
  ├── project
  ├── execution
  ├── database
  └── self-update
  ↓
createAppComposition()
  ├── recursos por instância Fastify
  └── lifecycle coordenado
  ↓
plugins de rota
  ↓
listen 127.0.0.1:4343
```

Serviços que mantêm recursos ativos precisam ser fechados no `onClose`.

## Requisição do navegador

### Desenvolvimento com Vite

```text
Vue :5174
   ↓ fetch /api/...
proxy Vite adiciona autenticação local
   ↓
API :4343
   ↓ origem + auth + JSON Schema
serviço
   ↓
resposta estruturada
```

### Distribuição local

O bootstrap efêmero **não é colocado na URL**.

```text
GET /
  ↓
API serve index.html em runtime
  ↓
injeta script mínimo com capacidade efêmera
  ↓
script grava diretamente em sessionStorage
  ↓
Vue inicia com URL limpa
  ↓
POST /api/auth/browser-session
  ↓
cookie HttpOnly + SameSite=Strict
  ↓
requests privadas autenticadas
```

A capacidade não é gravada no bundle em disco, query string, pathname ou `#bootstrap`.

Origem e JSON Schema são defesas adicionais, não substitutos da autenticação.

## Workspace e descoberta

```text
cadastrar workspace
        ↓
resolver caminho canônico
        ↓
persistir configuração
        ↓
scan
        ↓
Project Discovery detecta Rails/Node + capabilities
        ↓
se existir .dev-dashboard/production.json:
  valida Production Contract fail-closed
        ↓
ProjectStore recebe snapshot
```

Manifesto de produção inválido gera warning e não cria capability falsa.

## Servidor de desenvolvimento

```text
Iniciar
  ↓ projectId conhecido
resolver comando permitido
  ↓ Rails ou script Node reconhecido
Process Manager escolhe porta/cwd
  ↓ spawn shell:false
persistir starting + PID + log
  ↓ health/porta
running | failed
```

No Linux, uma porta só confirma `running` quando o listener pertence ao PID gerenciado ou descendente da mesma árvore. Um processo alheio na porta não é promovido para readiness do projeto.

O browser não envia a linha de comando final.

## Encerramento de processo

```text
Parar
  ↓
carregar estado persistido
  ↓
validar identidade PID/cwd
  ↓
SIGTERM ao grupo
  ↓ timeout
SIGKILL se necessário
  ↓
stopped
```

PID isolado não é prova de identidade.

## Logs

```text
IDs + limites
   ↓
backend deriva arquivo permitido
   ↓
lê janela limitada
   ↓
masking de segredos
   ↓
snapshot estruturado
```

A API não aceita path arbitrário de log vindo do browser.

## Git somente leitura

```text
status/diff/histórico
        ↓
projectId → cwd canônico
        ↓
subcomando Git permitido
        ↓
normalização + limites
        ↓
contrato público
```

## Git mutável

```text
preparar ação
   ↓
confirmationToken vinculado a operação/alvo
   ↓
confirmar
   ↓
revalidar contexto
   ↓
executar subcomando permitido
   ↓
registrar resultado
```

Tokens não são genéricos nem reutilizáveis.

## Worktrees

O recorte atual é read-only:

```text
Project.path
  ↓
git rev-parse --git-common-dir
  +
git worktree list --porcelain -z
  ↓
normalização bounded
  ↓
worktree.id estável por common-dir + path
```

Criação/remoção e integração com Environment Instance permanecem na #570/#598.

## Testes e execuções destacáveis

```text
redetectar comando reconhecido
        ↓
start em processo/PTY controlado
        ↓
estado + buffer limitado
        ↓
conclusão
        ↓
retenção transitória bounded
```

Execuções terminadas podem permanecer em memória para reanexação tardia; execuções ativas não são removidas por TTL/LRU. Shutdown precisa liberar subscriptions/timers e encerrar PTYs ativos de forma controlada.

## Banco de dados

### Snapshot

```text
projectId + environmentId
        ↓
resolver conexão reconhecida
        ↓
pg_dump/mysqldump sem shell
        ↓
credencial por canal próprio
        ↓
arquivo privado em estado local
```

### Restore

```text
escolher snapshot
        ↓
confirmação vinculada
        ↓
revalidar UUID/tamanho/token
        ↓
cliente conhecido sem shell
        ↓
resultado estruturado
```

Restore é destrutivo e exige confirmação explícita.

## Arquivos

```text
projectId + path relativo
        ↓
resolver/canonicalizar sob Project.path
        ↓
validar tamanho/tipo/encoding
        ↓
leitura ou preview de mutação
        ↓
revalidar versão/confirmar quando aplicável
```

## Docker Compose

O recorte implementado é read-only + preflight:

```text
docker compose config --format json
+
docker compose ps --all --format json
        ↓
normalização sem secrets
        ↓
Port Registry / Port Inspector
        ↓
ready | blocked | unavailable
```

Lifecycle mutável (`up/stop/restart/logs`) permanece na #588.

## Local CI com act

O recorte implementado descobre catálogo/preflight sem executar jobs ainda:

```text
.github/workflows/*.yml|yaml
        ↓
catálogo workflow/job/evento
        ↓
act --version + docker info
        ↓
available | act-missing | docker-unavailable
```

Quando a execução real entrar, o resultado continuará marcado como aproximação local e não substituirá o CI remoto.

## Production Contract

Durante o scan, um manifesto válido produz `Project.production` e capability `production`. O manifesto declara estratégia/provider/scripts/políticas, mas não executa nada.

```text
production.json
   ↓ validação fail-closed
Project.production
   ↓
DeploymentPlanner
```

## Deployment `strategy=command`

### Preview

```text
Preparar deployment
        ↓
resolver branch + HEAD
        ↓
working tree limpa?
        ↓
branch == production.branch?
        ↓
montar etapas conforme contrato/políticas
        ↓
planHash
        ↓
DeploymentPlan
```

### Start

```text
Confirmar
  ↓ token vinculado a projectId + revision + planHash
start
  ↓ recalcular plano
  ↓ consumir confirmação
check
  ↓
backup/migrate quando aplicáveis
  ↓
prod:deploy
  ↓
prod:verify
  ↓
succeeded | failed | cancelled | recovery_required
```

Cada `prod:*` é resolvido pelo backend, com `cwd=Project.path`, argumentos estruturados e log mascarado.

## Deployment `strategy=git-managed` + Vercel

```text
Preparar deployment
        ↓
planHash + confirmação
        ↓
etapas locais anteriores
        ↓
revalidar origin/<production.branch>
        ↓
provider-deploy para SHA exato
        ↓
polling bounded
        ↓
READY
        ↓
prod:verify
        ↓
succeeded
```

`READY` do provider não é health funcional.

## Deployment `strategy=self-update`

O próprio Dev Dashboard usa:

```text
check → self-update
```

Fluxo de ownership:

```text
plan + confirmation
        ↓
prepare/claim no agent
        ↓
worker instalado + execution.lock comprovado
        ↓
SIGTERM da API antiga
        ↓
preflight Git + merge --ff-only
        ↓
reinstalar release do agent
        ↓
startRuntime(targetRevision)
        ↓
health + x-dev-dashboard-revision
        ↓
reconciliação
```

### Runtime não gerenciado

`dev-web.mjs` pode iniciar diretamente o runtime.

### Runtime gerenciado por `local:install`

O caminho esperado é:

```text
dev-web prova checkout + metadados + unit gerenciada
        ↓
systemctl --user restart dev-dashboard.service
        ↓
health/revision
```

A unit é fixa e não vem do browser.

### Limitação conhecida #659

Em 2026-09-06 o worker ainda não propaga `DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT` ao `dev-web.mjs` iniciado no handoff. Na reprodução real, a API antiga encerrou e o serviço não voltou sozinho até um `systemctl --user restart dev-dashboard.service` manual.

A correção deve manter a raiz canônica já validada no handoff e permitir que `dev-web` delegue o restart ao systemd sem ampliar autoridade.

## Cancelamento de deployment

### Etapa local

```text
cancel
  ↓
AbortSignal
  ↓
SIGTERM → SIGKILL se necessário
```

### Provider Vercel

```text
cancel
  ↓
interromper polling
  ↓
tentar cancelamento remoto best-effort
  ↓
persistir estado conservador
```

### Self-update

Depois que o ownership passou ao worker externo e a API antiga agenda shutdown, não existe cancelamento simples pela API antiga. Incerteza posterior pode virar `recovery_required`.

## Retry de verify

Quando toda mutação anterior terminou e somente `verify` falhou:

```text
Verificar novamente
        ↓
revalidar projeto + contrato + branch/revision + ordem histórica
        ↓
executar somente prod:verify
```

Não repete backup, migration, deploy local ou provider-deploy.

## Crash e recovery

```text
API reinicia
  ↓
DeploymentStore carrega execuções ativas
  ↓
etapa irreversível já iniciou?
  ├── não → failed/interrupted
  └── sim → recovery_required
```

No self-update, a nova API consulta o handoff determinístico para reconciliar `accepted/applying/restarting/verifying/succeeded/failed/recovery_required` sem inventar sucesso.

## Shutdown coordenado

Toda camada que inicia recurso duradouro precisa possuir fechamento explícito: servidores, SSE/WS, watchers, processos filhos, timers, PTYs, language servers e adapters com polling.

No `onClose` do Fastify, o composition root coordena o fechamento dos serviços e escala TERM → KILL quando necessário. A operação deve ser idempotente e limpar timers/subscriptions/snapshots retidos.
