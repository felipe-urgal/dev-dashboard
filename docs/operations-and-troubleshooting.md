# Operação e troubleshooting

Este guia reúne portas, variáveis, persistência e procedimentos gerais para diagnosticar o ambiente local. Para falhas específicas de deployment, use também [deployment-operations.md](deployment-operations.md).

## Sistemas e runtimes

O caminho principal é Linux. O CI valida Node 20.19.0 como runtime mínimo suportado e mantém Node 24 como runtime principal; macOS possui suporte parcial em áreas que usam `lsof` e Windows nativo não é suportado. O CLI Bash exige Bash 4+.

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
| `gh` | recursos GitHub do CLI | opcional |
| `gum` | UX do CLI | opcional, há fallback |

Rode:

```bash
npm run doctor
```

## Serviços locais

| Serviço | Porta padrão | Escopo |
| --- | ---: | --- |
| API | 4343 | regras, persistência e integrações |
| Web | 5174 | frontend Vite |
| Preview web | 4173 | validação de build |

Listeners do produto devem permanecer em `127.0.0.1`.

O self-update agent não abre porta TCP; ele usa Unix socket local privado.

## Configuração local e `.env.example`

Para configuração local do processo de desenvolvimento:

```bash
cp .env.example .env.local
```

`npm run dev` carrega `.env.local` automaticamente. O arquivo real é ignorado pelo Git; `.env.example` é o template versionado e não deve conter credenciais reais.

### Variáveis configuráveis no desenvolvimento

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_API_PORT` | porta da API, padrão `4343` |
| `LOG_LEVEL` | nível do logger Fastify |
| `DEV_DASHBOARD_CONFIG_DIR` | diretório de configuração |
| `XDG_CONFIG_HOME` | base XDG alternativa de configuração |
| `DEV_DASHBOARD_STATE_DIR` | diretório de estado/logs/históricos, incluindo handoffs de self-update |
| `XDG_STATE_HOME` | base XDG alternativa de estado |
| `DEV_DASHBOARD_LOG_RETENTION_DAYS` | retenção padrão de logs |
| `DEV_DASHBOARD_BACKUP_DIR` | destino de `dev-backup` |
| `VERCEL_TOKEN` | autentica leitura e deployment de projetos `git-managed`/Vercel |
| `VERCEL_TEAM_ID` | escopo opcional de time quando necessário |

Exemplo mínimo para Vercel:

```dotenv
VERCEL_TOKEN=...
# VERCEL_TEAM_ID=team_...
```

Reinicie `npm run dev` depois de mudar `.env.local`.

Nunca publique o conteúdo de `.env.local`. `VERCEL_TOKEN` não pertence a `.dev-dashboard/production.json` e não deve aparecer em issue, PR, screenshot ou log.

### Variáveis internas/efêmeras

As variáveis abaixo são criadas ou controladas pelo próprio tooling e **não** devem ser tratadas como configuração manual em `.env.local`:

| Variável | Uso interno |
| --- | --- |
| `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` | ativa frontend estático servido pela API |
| `DEV_DASHBOARD_WEB_DIST` | aponta para o build web da distribuição local |
| `DEV_DASHBOARD_BROWSER_BOOTSTRAP` | capacidade efêmera de bootstrap do navegador |
| `DEV_DASHBOARD_RUNTIME_REVISION` | revision já validada/aplicada propagada pelo worker ao runtime reiniciado |
| `DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT` | checkout já validada passada internamente ao worker instalado |

Não exporte `DEV_DASHBOARD_RUNTIME_REVISION` manualmente para tentar “provar” uma atualização. No fluxo real ela é derivada da revision do handoff revalidada/aplicada pelo worker e só é aceita no health quando possui formato de SHA válido.

### Overrides operacionais do self-update agent

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR` | override do diretório da cópia instalada do agent |
| `DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR` | override do diretório do Unix socket |
| `XDG_RUNTIME_DIR` | base preferida do Unix socket quando disponível |

Esses overrides são tooling local/operacional e não entram no Production Contract nem são enviados pelo browser.

`npm run self-update:agent` **não carrega `.env.local` automaticamente**. Quando precisar desses overrides, exporte-os conscientemente no shell antes do comando.

## Arquivos locais

Configuração:

```text
~/.config/dev-dashboard/
├── config.json
├── api-token
├── self-update-agent-token
└── preferências locais
```

Estado:

```text
~/.local/state/dev-dashboard/
├── processes/
├── logs/
├── deployments/
├── self-update/
├── históricos de testes/scripts
└── snapshots de banco
```

Instalação user-space do self-update agent:

```text
~/.local/lib/dev-dashboard/self-update-agent/
├── current.json
└── releases/<sha256>/
    ├── self-update-agent.mjs
    ├── self-update-agent-runtime.mjs
    └── self-update-handoff.mjs
```

Diretórios privados usam `0700`; arquivos privados de configuração/estado usam `0600`. Os arquivos executáveis da release instalada não concedem acesso a grupo/outros e são verificados por SHA-256 antes do start.

Deployments persistem timeline/log/histórico, mas **não** token de confirmação nem credenciais Vercel. `self-update/` persiste somente handoff estruturado (`projectId`, revision, `planHash`, estado/timestamps e resultado terminal sanitizado) e o lock operacional; não contém shell, senha ou unit configurável.

## Diagnóstico inicial

```bash
npm run doctor
curl -i http://127.0.0.1:4343/api/health
```

No runtime normal de desenvolvimento, o health continua com o JSON público padrão. Quando a API foi iniciada pelo worker de self-update, o header abaixo identifica a revision que o runtime recebeu do fluxo já validado:

```text
x-dev-dashboard-revision: <sha>
```

Se a web estiver em desenvolvimento, abra `http://127.0.0.1:5174`.

## `npm run dev` não inicia

### Dependências ausentes

```bash
npm install
npm run doctor
npm run dev
```

### Node incompatível

```bash
node --version
```

Use uma versão compatível com `package.json`. O CI cobre explicitamente Node 20.19.0 como mínimo e Node 24 como runtime principal.

### Package compartilhado desatualizado

```bash
npm run build:packages
```

Depois rode o typecheck do workspace que falhou.

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
4. token local legível pelo processo;
5. request passando pelo proxy `/api`.

Rota privada via curl:

```bash
TOKEN="$(cat ~/.config/dev-dashboard/api-token)"
curl -H "X-Dev-Dashboard-Token: $TOKEN" http://127.0.0.1:4343/api/workspaces
```

Não publique o token.

## Erro de origem/CORS

A aplicação aceita uma lista fechada de origens locais. Não use IP de LAN, `0.0.0.0`, túnel público ou iframe em origem externa como atalho.

## Projeto não aparece

Confira:

- workspace correto;
- scan executado;
- `package.json` para Node ou `Gemfile` Rails;
- limites do scan recursivo, quando habilitado;
- warnings retornados pelo discovery.

## Aba Produção não aparece

A capability `production` só existe quando `.dev-dashboard/production.json` é válido.

Confira no projeto alvo:

```bash
cat .dev-dashboard/production.json
cat package.json
```

Não inclua segredos no manifesto. Se o scan indicar `productionWarning`, corrija shape/versão/scripts declarados e faça novo scan.

## Produção aparece como bloqueada

`strategy=disabled` continua sendo um estado deliberado para projetos que optam por manter produção desabilitada. Leia `reasonCode`, `blockedBy` e o documento indicado pelo contrato.

O próprio Dev Dashboard **não** está nesse estado: `.dev-dashboard/production.json` declara `production.enabled=true`, `strategy=self-update`, `provider=none` e branch `main`. Desde o #527, esse fluxo passa pelo planner, confirmação e revalidação normais do domínio de deployment e usa a cadeia user-space fechada nos PRs #520/#521/#523.

## Self-update helper e agent

O helper de handoff continua disponível para inspeção direta de engenharia:

```bash
npm run self-update:helper --
```

Ele expõe `prepare`, `claim`, `inspect` e `recover` diretamente sobre o estado persistido.

O agent adiciona uma cópia instalada fora do repositório e um processo independente do Fastify:

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
npm run self-update:agent -- status
npm run self-update:agent -- ping
npm run self-update:agent -- stop
```

`install`:

- copia somente os arquivos conhecidos do agent/handoff;
- cria uma release por hash em `~/.local/lib/dev-dashboard/self-update-agent/releases/`;
- publica `current.json` por escrita atômica;
- cria/reutiliza `self-update-agent-token` privado;
- não altera nem habilita automaticamente o Production Contract do projeto.

`start` valida manifesto, tipo/permissão dos arquivos e SHA-256 antes de executar a release instalada com `shell: false` e processo destacado. O modo servidor recusa ser iniciado diretamente da checkout.

`status` e `ping` consultam o Unix socket autenticado. O catálogo **remoto** atual continua:

```text
ping
inspect
claim
recover
```

Não existe executor remoto genérico no socket.

Para um handoff conhecido:

```bash
npm run self-update:agent -- inspect <handoff-id>
npm run self-update:agent -- claim <handoff-id>
```

`claim` apenas transfere ownership de `prepared` para `accepted`.

### Tooling local `execute`

O tooling local possui também:

```bash
npm run self-update:agent -- execute <handoff-id>
```

Esse comando é **tooling local de engenharia**, não uma operação remota do socket e não substitui o fluxo suportado pelo Production Contract, planner, confirmação e revalidação.

Ele só aceita um handoff previamente `accepted` e revalida a checkout antes de iniciar um worker instalado. O worker exige:

- checkout real do `dev-dashboard`, sem symlink;
- working tree limpa, incluindo untracked;
- branch `main`;
- `origin/main` exatamente igual à revision do handoff;
- relação fast-forward com o `HEAD` atual;
- exclusividade por lock privado.

Depois de spawnar o worker, a API ainda não encerra imediatamente. Ela aguarda `self-update/execution.lock`, exige o mesmo PID/handoff retornado pelo `execute` e confirma que o processo está vivo. Só então agenda `SIGTERM`; o handler normal da API executa `app.close()`.

Depois que a API antiga deixa a porta, o worker repete o preflight, aplica somente `git merge --ff-only <revision>`, comprova `HEAD`, reinstala a release do agent e inicia `scripts/dev-web.mjs` em processo destacado.

Não há `sudo`, `systemctl`, unit livre ou comando vindo do browser.

### Readiness e prova de revision

O retorno da porta 4343 sozinho não é sucesso.

O JSON público de `/api/health` permanece:

```text
status
service
timestamp
```

No runtime reiniciado pelo worker, a API também devolve:

```text
x-dev-dashboard-revision: <targetRevision>
```

O worker exige `status=ok`, `service=dev-dashboard-api` e o header exatamente igual à revision aplicada. Header ausente, inválido ou diferente mantém readiness pendente até o timeout; depois de `applying`, isso termina como `recovery_required`.

Para diagnóstico após um restart:

```bash
curl -i http://127.0.0.1:4343/api/health
git rev-parse HEAD
git ls-remote --heads origin main
```

As três evidências devem ser coerentes antes de considerar o estado saudável.

### Teste real de restart/recovery

`scripts/self-update-restart.integration.test.mjs` cria um repositório e `origin` temporários, sobe uma API antiga real, executa fetch/fast-forward reais, inicia um novo runtime HTTP e valida a revision.

Há dois cenários:

- revision correta volta → `succeeded` e resultado persistido;
- porta volta com outra revision → readiness falha e o handoff fica `recovery_required`.

Assim, o teste não trata “processo subiu” como prova de atualização correta.

### Recovery do self-update

Se o agent reiniciar e encontrar handoff já assumido sem resultado terminal, ele executa recovery conservador automaticamente. O diagnóstico manual equivalente é:

```bash
npm run self-update:agent -- recover
```

Isso marca o registro como `recovery_required`; não executa rollback cego.

No worker do #523, falha antes de iniciar mutação pode terminar em `failed`; depois de entrar em `applying`, falha é tratada conservadoramente como `recovery_required`.

### Agent não inicia

Primeiro confirme a instalação:

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
```

Erros de hash, symlink, arquivo com permissões abertas ou manifesto inválido são fail-closed. Não edite `current.json` para contornar validação; reinstale a partir de uma checkout confiável e investigue a alteração inesperada.

### Token do agent inválido

O token fica em:

```text
~/.config/dev-dashboard/self-update-agent-token
```

Ele precisa ser arquivo regular, privado e `0600`. Não compartilhe esse conteúdo e não reutilize o token HTTP da API como substituto.

Se o arquivo foi adulterado/perdido enquanto um agent antigo ainda roda, encerre conscientemente o processo antes de recriar credenciais; não trate ausência do token como prova de que o processo está parado.

### Socket do agent

Quando `XDG_RUNTIME_DIR` estiver disponível, o socket fica sob:

```text
$XDG_RUNTIME_DIR/dev-dashboard/self-update-agent/agent.sock
```

O diretório é privado e o socket usa `0600`. Um path existente que não seja socket real/pertencente ao usuário é recusado; o agent não remove arquivo arbitrário para “destravar” o start.

Se `inspect`/`recover` informar estado persistido inválido, não edite o JSON para forçar continuação. Preserve uma cópia para diagnóstico quando necessário e corrija/remova o estado somente depois de entender a origem.

### Execução já em andamento

O worker usa `self-update/execution.lock` para exclusividade.

Se receber `SELF_UPDATE_EXECUTION_ALREADY_RUNNING`, não remova o lock manualmente sem confirmar se o PID registrado está vivo. O próprio tooling remove lock stale somente quando comprova ausência do processo.

Se o lock for symlink, tiver owner/permissões inadequados ou conteúdo inválido, a execução falha fechado com erro de lock inseguro.

## Vercel: integração não configurada

Sintoma na UI:

```text
Integração Vercel não configurada
```

Prepare a configuração sem imprimir o token:

```bash
cd /caminho/do/dev-dashboard
cp -n .env.example .env.local
test -f .env.local && echo '.env.local existe'
```

Preencha `VERCEL_TOKEN` localmente e reinicie:

```bash
npm run dev
```

Se você exporta a variável diretamente no shell:

```bash
test -n "$VERCEL_TOKEN" && echo 'VERCEL_TOKEN presente' || echo 'VERCEL_TOKEN ausente'
```

## Vercel: autenticação falhou

`DEPLOYMENT_PROVIDER_AUTH_FAILED` indica token/escopo recusado.

- gere/use token válido na Vercel;
- confirme `VERCEL_TEAM_ID` somente quando o projeto estiver sob esse time;
- reinicie o processo após ajustar `.env.local`;
- não cole a credencial no diagnóstico.

## Vercel: projeto não encontrado

`DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND` normalmente significa que `production.external.project` não existe no escopo do token/team.

Confira o manifesto do projeto alvo e o nome/ID do projeto Vercel. Não tente contornar alterando o nome da pasta local.

## Vercel: revision remota não pôde ser confirmada

Antes de `provider-deploy`, o dashboard exige que a revision confirmada seja exatamente a revision atual de `origin/<production.branch>`.

Diagnóstico somente leitura:

```bash
git status --short --branch
git remote -v
git rev-parse HEAD
git ls-remote --heads origin main
```

Troque `main` pela branch declarada.

Casos comuns:

- commit local ainda não foi enviado;
- remote indisponível;
- branch remota mudou após o preview;
- origin aponta para outro repositório.

Corrija o Git conscientemente e **gere novo plano**; não force o dashboard a usar uma ref stale.

## Vercel: deployment BUILDING por muito tempo

O polling do dashboard é bounded. Se o provider não chegar a estado terminal dentro da janela, o domínio não inventa sucesso.

Abra o deployment na Vercel para investigar build/log do provider e mantenha a execução local como falha/indeterminada conforme a timeline registrada.

## Vercel READY, mas verify falhou

`READY` não é health da aplicação.

Se a UI oferecer **Verificar novamente**, use essa ação. Ela repete somente `prod:verify` quando o backend comprova que o caso é seguro.

Não dispare um segundo deployment apenas para repetir readiness.

## `recovery_required`

Esse estado significa que uma etapa potencialmente irreversível já começou.

Antes de qualquer rollback/retry:

1. revise timeline e log;
2. confira provider/aplicação;
3. confira schema/migration;
4. valide backup/checkpoint;
5. leia `production.policies.rollback`.

No self-update, confira também `git status`, `git rev-parse HEAD`, `origin/main`, estado do agent e handoff persistido antes de qualquer ação manual.

Não promova deployment antigo nem reverta a checkout cegamente se o estado já mudou.

## Deployment já em andamento

Existe um único deployment mutável ativo globalmente. Status Vercel somente leitura não ocupa esse slot.

Acompanhe/cancele o deployment atual; não mate a API para contornar a trava.

## Logs vazios/truncados

Logs são deliberadamente limitados e mascarados. Abra o arquivo local somente em máquina confiável se precisar de detalhe adicional e revise o conteúdo antes de compartilhar.

## Git mostra estado inesperado

```bash
git status --short --branch
git remote -v
git branch -vv
```

A UI deve representar estado real e não mostrar atividade quando não há trabalho em execução.

Para self-update, uma working tree suja, branch diferente de `main` ou `origin/main` divergente bloqueia a execução por design. Corrija conscientemente o repositório; não use reset destrutivo para satisfazer o preflight.

## Banco/snapshot falha

Confira cliente (`pg_dump`/`mysqldump`), host/porta, permissão, espaço em disco, serviço e limites. Senhas não devem aparecer em argv/log.

## Build/typecheck

Web:

```bash
npm run typecheck --workspace=@dev-dashboard/web
npm run build --workspace=@dev-dashboard/web
```

API:

```bash
npm run build:packages
npm run typecheck --workspace=@dev-dashboard/api
npm run build --workspace=@dev-dashboard/api
```

## Referência da API desatualizada

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada; não edite manualmente.

## Validação completa

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
npm run test:e2e
```

Use a suíte completa antes de concluir mudanças de fluxo crítico.

## Backup/restauração do estado local

O CLI `dev-backup` pode empacotar configuração/estado local. O token da API não é incluído; segredos só entram quando a opção explícita correspondente for usada.

Esse backup local é diferente dos backups dos **projetos em produção**. O Production Contract de cada projeto continua responsável por declarar sua política real de backup/recovery.

## Mais detalhes

- [Guia de Produção](guia/producao.md)
- [Operação de deployments](deployment-operations.md)
- [Segurança](architecture/security.md)
- [Self-production](architecture/self-production.md)
