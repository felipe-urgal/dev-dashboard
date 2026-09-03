# Fluxos de execução

Esta página resume os principais fluxos runtime do Dev Dashboard, as camadas envolvidas e os controles que precisam permanecer presentes.

## Inicialização de desenvolvimento

```text
npm run dev
        ↓
predev compila packages/*
        ↓
scripts/dev.mjs carrega .env.local quando existir
        ↓
API Fastify :4343 + Vite :5173
        ↓
um filho encerra inesperadamente
        ↓
orquestrador encerra os demais
```

No Linux, filhos usam grupos próprios. Shutdown envia `SIGTERM` e só escala para `SIGKILL` após a janela de tolerância.

`.env.local` é configuração local do Dev Dashboard. É onde integrações como Vercel podem receber `VERCEL_TOKEN`/`VERCEL_TEAM_ID` sem versionar segredo.

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

A interface `AppContext` consumida pelas rotas permanece estável; a separação por domínio existe no composition root para tornar dependências e ownership de recursos explícitos. `app.ts` continua registrando segurança e rotas na ordem existente.

Serviços que mantêm recursos ativos precisam ser fechados no `onClose`.

## Requisição do navegador

### Desenvolvimento com Vite

```text
Vue :5173
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

```text
URL com bootstrap efêmero no fragmento
        ↓
frontend move para sessionStorage
        ↓
POST /api/auth/browser-session
        ↓
cookie HttpOnly + SameSite=Strict
        ↓
requests autenticados
```

Origem e JSON são defesas adicionais, não substitutos da autenticação.

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

Manifesto de produção inválido gera warning no projeto e não cria capability falsa.

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

Na aba Servidor, o snapshot é passado diretamente ao `ProjectLogTerminal`/xterm. Não existe pós-processamento global do DOM para detalhes de log; quando uma superfície usa apresentação estruturada, classificação, busca e diagnóstico ficam em componentes/parsers Vue como `ProjectLogExperience`, `LogExperienceFlow` e `utils/log-experience.ts`.

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

## Testes e execuções destacáveis

```text
redetectar comando reconhecido
        ↓
start em processo/PTY controlado
        ↓
estado + buffer limitado
        ↓
SSE/WS conforme superfície
        ↓
conclusão
        ↓
retenção transitória em memória
  TTL 30 min + máx. 32 finalizadas
        ↓
expiração ou LRU
```

Testes completos, Migration Rails e Dependências/Build podem sobreviver à desconexão do navegador sem ganhar stdin arbitrário. O serviço compartilhado mantém o buffer já mascarado com teto de 256 KiB por execução.

A política de retenção vale **somente** para execuções terminadas. O TTL é contado desde o término e acesso recente influencia somente qual registro finalizado sai primeiro quando o teto de 32 é excedido. Uma execução `running` nunca é removida por TTL/LRU e `detach()` continua significando apenas desconectar o observador.

Ao terminar normalmente, o serviço libera as subscriptions internas do `node-pty` e mantém apenas o snapshot transitório necessário para reanexação tardia. Não existe persistência desse histórico em disco nem variável de ambiente para ampliar a retenção.

## Banco de dados

### Snapshot

```text
projectId + environmentId
        ↓
resolver conexão reconhecida
        ↓
pg_dump/mysqldump sem shell
        ↓
credencial por canal próprio do driver/cliente
        ↓
arquivo 0600 em estado privado
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
DeploymentPlan (sem execução)
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

Cada `prod:*` é resolvido pelo backend e executado com package manager reconhecido, `cwd=Project.path`, `shell:false` e log mascarado.

## Deployment `strategy=git-managed` + Vercel

O fluxo usa o mesmo planner/confirmacão/store/timeline, mas a promoção é uma etapa externa tipada `provider-deploy`.

### Preview

```text
Preparar deployment
        ↓
branch + HEAD + working tree limpa
        ↓
contrato exige vercel + external.project + check/verify
        ↓
migrate incluído quando migrations=before-deploy
        ↓
provider-deploy incluído no plano
        ↓
planHash + confirmação
```

### Revalidação antes da promoção

Depois das etapas locais anteriores e **imediatamente antes** de criar o deployment Vercel:

```text
revision confirmada
        ↓
git ls-remote origin production.branch
        ↓
SHA remoto existe e é igual?
   ├── não/indisponível → falhar fechado
   └── sim
        ↓
resolver remote GitHub no backend
```

Uma ref local `refs/remotes/origin/...` não substitui essa prova remota para autorizar a mutação.

### Criação e polling

```text
VercelDeploymentAdapter
        ↓
resolver production.external.project
        ↓
POST deployment target=production
  gitSource = GitHub resolvido
  ref       = production.branch
  sha       = revision confirmada
        ↓
acompanhar deployment específico
        ↓
QUEUED/INITIALIZING → BUILDING → READY | ERROR | CANCELED
        ↓
READY
        ↓
prod:verify
        ↓
succeeded
```

O browser não informa owner/repo/ref/sha nem token Vercel. `READY` termina a etapa do provider, não o health da aplicação.

## Status Vercel

A leitura de status é separada da mutação:

```text
GET /deployments/status
        ↓
external.project
        ↓
Vercel API
        ↓
production deployment + revision + state
        ↓
ref local conhecida de origin/<branch>
        ↓
in-sync | drift | unknown
```

A leitura não faz `git fetch`. A prova remota forte acontece somente quando um novo `provider-deploy` vai começar.

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

Depois de migration/promoção iniciada, cancelamento pode exigir `recovery_required`.

## Retry de verify

Quando a timeline prova que toda mutação anterior terminou e somente o `verify` final falhou:

```text
Verificar novamente
        ↓
revalidar projeto + contrato + branch/revision + ordem histórica
        ↓
caso seguro?
   ├── não → recusar / novo plano
   └── sim
        ↓
executar somente prod:verify
```

Não repete backup, migration, `prod:deploy` ou `provider-deploy`.

## Sudo em deployment local

```text
senha no modal local
        ↓
sudo -S -v
        ↓
outro processo pai
        ↓
sudo -n -v
        ↓
ticket reutilizável?
  ├── não → fail-closed + orientar NOPASSWD mínima
  └── sim → etapa local pode prosseguir
```

A senha não é persistida, não entra no ambiente e não é encaminhada ao script de produção.

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

O domínio não assume que uma mutação interrompida “não aconteceu”.

## Shutdown coordenado

Toda camada que inicia recurso duradouro precisa possuir fechamento explícito: servidores, SSE/WS, watchers, processos filhos, timers, PTYs, language servers e adapters com polling.

No `onClose` do Fastify, o composition root fecha os serviços de execução/histórico, depois o serviço compartilhado de PTYs destacáveis, sessões de banco, language servers, terminais interativos e deployment. Para PTYs destacáveis ainda ativos, `close()` remove observadores, envia `SIGTERM`, aguarda a mesma janela de 1 segundo usada no cancelamento e escala para `SIGKILL` se necessário. A operação é idempotente e limpa também timers/subscriptions e snapshots retidos.
