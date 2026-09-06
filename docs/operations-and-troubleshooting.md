# Operação e troubleshooting

Este guia reúne portas, variáveis, persistência e procedimentos para diagnosticar o ambiente local. Para falhas específicas de deployment, use também [deployment-operations.md](deployment-operations.md). Para a instalação permanente, veja [local-installation.md](local-installation.md).

## Sistemas e runtimes

O caminho principal é Linux. O CI usa Node 24 como runtime principal; Node 20.19.0 permanece no contrato público e deve ser validado de forma direcionada quando uma mudança tocar runtime/dependências. O CLI Bash exige Bash 4+.

Requisitos principais:

| Dependência | Escopo | Obrigatória? |
| --- | --- | --- |
| Node.js `^20.19.0 || >=22.12.0` | dashboard web/API | sim |
| npm | monorepo | sim |
| Git | dashboard e CLI | sim |
| Bash 4+ | CLI | sim |
| Ruby/Bundler/Rails | projetos Rails | quando aplicável |
| MySQL/PostgreSQL/Docker | projetos alvo | quando aplicável |
| `pg_dump`/`mysqldump` | snapshot via CLI | quando aplicável |
| `gh` | Cockpit/recursos GitHub quando necessário | opcional |
| `gum` | UX do CLI | opcional, há fallback |

Rode:

```bash
npm run doctor
```

## Serviços e portas

| Serviço | Porta padrão | Escopo |
| --- | ---: | --- |
| API | 4343 | regras, persistência e integrações |
| Web Vite | 5174 | frontend de desenvolvimento |
| Preview web | 4173 | validação de build |

Listeners do produto devem permanecer em `127.0.0.1`.

A instalação permanente publica por padrão:

```text
http://dev-dashboard.localhost:4343
```

O self-update agent não abre porta TCP; ele usa Unix socket local privado.

## Configuração local e `.env.local`

```bash
cp .env.example .env.local
```

`npm run dev` carrega `.env.local` automaticamente. A unit criada por `local:install` também lê `.env.local` como arquivo opcional, preservando porta/origem gerenciadas nos metadados próprios da instalação.

O arquivo real é ignorado pelo Git; `.env.example` é o template versionado e não deve conter credenciais reais.

### Variáveis configuráveis

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_API_PORT` | porta da API, padrão `4343`; em instalação permanente exige reinstalação para alterar o contrato gerenciado |
| `LOG_LEVEL` | nível do logger Fastify |
| `DEV_DASHBOARD_CONFIG_DIR` | diretório de configuração |
| `XDG_CONFIG_HOME` | base XDG alternativa de configuração |
| `DEV_DASHBOARD_STATE_DIR` | diretório de estado/logs/históricos |
| `XDG_STATE_HOME` | base XDG alternativa de estado |
| `DEV_DASHBOARD_LOG_RETENTION_DAYS` | retenção padrão de logs |
| `DEV_DASHBOARD_BACKUP_DIR` | destino de `dev-backup` |
| `VERCEL_TOKEN` | autentica leitura/deployment Vercel |
| `VERCEL_TEAM_ID` | escopo opcional de time |

Exemplo:

```dotenv
VERCEL_TOKEN=...
# VERCEL_TEAM_ID=team_...
```

Nunca publique `.env.local` nem copie um token real para issue, PR, screenshot ou log. Se um segredo for exposto, revogue/rotacione no provider e substitua o valor local.

### Variáveis internas/efêmeras

Não trate como configuração manual:

| Variável | Uso interno |
| --- | --- |
| `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` | ativa frontend estático servido pela API |
| `DEV_DASHBOARD_WEB_DIST` | aponta para o build web da distribuição local |
| `DEV_DASHBOARD_BROWSER_BOOTSTRAP` | capacidade efêmera de bootstrap do navegador |
| `DEV_DASHBOARD_RUNTIME_REVISION` | revision validada/aplicada propagada ao runtime reiniciado |
| `DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT` | checkout canônica já validada usada no handoff gerenciado |

Não exporte essas variáveis para tentar contornar validações de self-update.

### Overrides operacionais do agent

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR` | diretório da cópia instalada do agent |
| `DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR` | diretório do Unix socket |
| `XDG_RUNTIME_DIR` | base preferida do socket |

`npm run self-update:agent` não carrega `.env.local` automaticamente para esses overrides; exporte conscientemente no shell quando necessário.

## Arquivos locais

Configuração:

```text
~/.config/dev-dashboard/
├── config.json
├── api-token
├── self-update-agent-token
└── local-install.json / local-runtime.env quando instalado
```

Estado:

```text
~/.local/state/dev-dashboard/
├── processes/
├── logs/
├── deployments/
├── self-update/
└── snapshots/históricos locais
```

Agent:

```text
~/.local/lib/dev-dashboard/self-update-agent/
├── current.json
└── releases/<sha256>/
```

Diretórios privados usam permissões restritas; tokens/arquivos sensíveis permanecem fora do repositório.

## Diagnóstico inicial

Desenvolvimento/manual:

```bash
npm run doctor
curl -i http://127.0.0.1:4343/api/health
```

Instalação permanente:

```bash
npm run local:status
systemctl --user status dev-dashboard.service --no-pager -l
journalctl --user -u dev-dashboard.service -n 120 --no-pager
curl -i http://dev-dashboard.localhost:4343/api/health
```

Quando a API está associada a uma revision de self-update, o response inclui:

```text
x-dev-dashboard-revision: <sha>
```

## `npm run dev` não inicia

### Dependências ausentes

```bash
npm ci
npm run doctor
npm run dev
```

### Node incompatível

```bash
node --version
```

Use uma versão compatível com `package.json`.

### Package compartilhado desatualizado

```bash
npm run build:packages
```

Depois rode o check/workspace que falhou.

## Porta ocupada

```bash
ss -ltnp | grep ':4343\|:5174'
```

Não encerre um PID sem confirmar sua identidade.

## Dashboard abre, mas API falha

Confira:

1. API em `127.0.0.1:4343`;
2. web em `127.0.0.1:5174` no modo Vite;
3. origem correta;
4. token/sessão local;
5. request passando pelo proxy `/api` quando em desenvolvimento.

Rota privada via curl:

```bash
TOKEN="$(cat ~/.config/dev-dashboard/api-token)"
curl -H "X-Dev-Dashboard-Token: $TOKEN" http://127.0.0.1:4343/api/workspaces
```

Não publique o token.

## URL amigável responde health, mas `curl -I /` retorna 404

O fallback da SPA considera o header `Accept`. Um `HEAD` genérico com `Accept: */*` pode resultar em `404` mesmo com frontend saudável.

Teste como navegador:

```bash
curl -I -H 'Accept: text/html' http://dev-dashboard.localhost:4343/
```

O esperado é `200` + `content-type: text/html`.

Também é possível testar o body:

```bash
curl -sS -H 'Accept: text/html' http://dev-dashboard.localhost:4343/ | head
```

## Bootstrap aparece na URL

O servidor atual não deve gerar `#bootstrap=...`.

A capacidade é injetada no HTML servido em runtime e gravada diretamente no `sessionStorage` antes do bundle iniciar.

Se a URL permanecer com um fragmento de bootstrap após atualizar para uma revision que inclui #656:

1. confirme a revision em `git rev-parse HEAD`;
2. execute `npm run local:install` para rebuild + restart;
3. abra `http://dev-dashboard.localhost:4343` em nova aba;
4. confira o journal se o runtime ainda estiver servindo código antigo.

Não copie o token manualmente.

## `local:install` diz serviço ativo, mas health ainda não responde

O instalador atual espera `/api/health` antes de retornar sucesso. Se ele falhar:

```bash
npm run local:status
journalctl --user -u dev-dashboard.service -n 120 --no-pager
```

Se você executar `systemctl --user restart` manualmente e consultar `local:status` imediatamente, existe uma pequena janela em que a unit já está `active` mas a API ainda não terminou de subir. Repita o health depois de alguns segundos; `local:install` evita essa corrida aguardando readiness internamente.

## Erro de origem/CORS

A aplicação aceita uma lista fechada de origens locais. Não use IP de LAN, `0.0.0.0`, túnel público ou iframe externo como atalho.

## Projeto não aparece

Confira:

- workspace correto;
- scan executado;
- `package.json` para Node ou `Gemfile` Rails;
- limites do scan recursivo;
- warnings retornados pelo discovery.

## Aba Produção não aparece

A capability `production` só existe quando `.dev-dashboard/production.json` é válido.

```bash
cat .dev-dashboard/production.json
cat package.json
```

Não inclua segredos no manifesto.

O próprio Dev Dashboard possui contrato ativo `strategy=self-update`, `provider=none`, branch `main`.

## Produção aparece bloqueada/não configurada

- `strategy=disabled` é bloqueio deliberado do projeto alvo;
- Vercel sem `VERCEL_TOKEN` aparece `not-configured`;
- self-production exige agent pronto para `prod:check`.

Para o próprio Dashboard:

```bash
npm run self-update:agent -- status
npm run prod:status
npm run prod:check
```

Se o agent ainda não estiver instalado:

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
```

## Self-update helper e agent

Tooling de engenharia:

```bash
npm run self-update:helper --
npm run self-update:agent -- install
npm run self-update:agent -- start
npm run self-update:agent -- status
npm run self-update:agent -- ping
npm run self-update:agent -- stop
```

O catálogo remoto do socket continua fechado:

```text
ping
inspect
claim
recover
```

`execute <handoff-id>` é tooling local, não operação remota do browser.

O worker exige checkout confiável, working tree limpa, `main`, `origin/main` exato, fast-forward e lock privado.

## Redeploy/self-update não volta após o restart

O fluxo gerenciado atual propaga a revision alvo e a raiz canônica da checkout já validada para `dev-web.mjs`. A delegação ao systemd só ocorre quando a raiz real coincide com a instalação registrada e a unit fixa possui ownership válido.

Se o browser ficar sem conexão além da janela normal de restart, diagnostique antes de repetir o deployment:

```bash
npm run local:status
systemctl --user status dev-dashboard.service --no-pager -l
journalctl --user -u dev-dashboard.service -n 120 --no-pager
curl -i http://127.0.0.1:4343/api/health
```

Confira também a revision aplicada:

```bash
git rev-parse HEAD
git ls-remote --heads origin main
```

Um restart manual da unit pode recuperar a disponibilidade, mas **não deve converter um handoff incerto em `succeeded` por inferência**. Revise o estado persistido do deployment/agent antes de nova tentativa.

Falhas típicas a investigar incluem unit não gerenciada/marker inválido, metadados de `local:install` inconsistentes, checkout real divergente, erro de bootstrap/build do runtime ou health/revision que não atingem a prova esperada.

## Readiness e prova de revision

O retorno da porta 4343 sozinho não é sucesso de self-update.

O worker exige:

- `status=ok`;
- `service=dev-dashboard-api`;
- header `x-dev-dashboard-revision` exatamente igual à revision alvo.

Diagnóstico:

```bash
curl -i http://127.0.0.1:4343/api/health
git rev-parse HEAD
git ls-remote --heads origin main
```

As evidências precisam ser coerentes.

## Recovery do self-update

```bash
npm run self-update:agent -- recover
```

Recovery marca situação incerta como `recovery_required`; não executa rollback cego.

Falha antes da mutação pode terminar em `failed`; depois de `applying`, incerteza relevante permanece conservadora.

## Agent não inicia

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
```

Erros de hash, symlink, permissões abertas ou manifesto inválido são fail-closed. Reinstale a release a partir de checkout confiável em vez de editar `current.json` manualmente.

## Token/socket do agent

Token:

```text
~/.config/dev-dashboard/self-update-agent-token
```

Socket preferencial:

```text
$XDG_RUNTIME_DIR/dev-dashboard/self-update-agent/agent.sock
```

O token é separado do token HTTP e o socket/diretório possuem permissões privadas.

## CI local / CI do repositório

O gate obrigatório do PR é:

```bash
npm run check
```

Hoje ele executa:

```text
format:check -> lint -> test -> build:apps
```

O workflow CI possui um único job `Validate` depois de `npm ci --ignore-scripts` e `npm rebuild esbuild node-pty`.

E2E, typecheck, API docs e coverage são checks direcionados conforme o risco. Veja [testing-and-quality.md](testing-and-quality.md) e [ci-fix-playbook.md](ci-fix-playbook.md).

## Regra operacional

Ao diagnosticar:

1. prove o estado com comandos read-only;
2. diferencie serviço, API, frontend, provider e handoff;
3. não copie segredos para logs/issues;
4. não use restart/retry cego como substituto da causa raiz;
5. depois da recuperação, confirme health/revision/estado persistido antes de nova mutação.
