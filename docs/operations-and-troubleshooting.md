# Operação e troubleshooting

Este guia reúne portas, variáveis, persistência e procedimentos gerais para diagnosticar o ambiente local. Para falhas específicas de deployment, use também [deployment-operations.md](deployment-operations.md).

## Sistemas e runtimes

O caminho principal é Linux, validado em CI com Node 24. macOS possui suporte parcial em áreas que usam `lsof`; Windows nativo não é suportado. O CLI Bash exige Bash 4+.

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
| Web | 5173 | frontend Vite |
| Preview web | 4173 | validação de build |

Listeners do produto devem permanecer em `127.0.0.1`.

## Variáveis de ambiente

### API e distribuição

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_API_PORT` | porta da API, padrão `4343` |
| `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` | serve frontend estático pela API |
| `DEV_DASHBOARD_WEB_DIST` | diretório canônico do build web |
| `DEV_DASHBOARD_BROWSER_BOOTSTRAP` | bootstrap efêmero do navegador |
| `LOG_LEVEL` | nível do logger Fastify |

### Configuração e estado

| Variável | Finalidade |
| --- | --- |
| `DEV_DASHBOARD_CONFIG_DIR` | diretório de configuração |
| `XDG_CONFIG_HOME` | base XDG alternativa de configuração |
| `DEV_DASHBOARD_STATE_DIR` | diretório de estado/logs/históricos |
| `XDG_STATE_HOME` | base XDG alternativa de estado |
| `DEV_DASHBOARD_LOG_RETENTION_DAYS` | retenção padrão de logs |
| `DEV_DASHBOARD_BACKUP_DIR` | destino de `dev-backup` |

### Vercel

| Variável | Finalidade |
| --- | --- |
| `VERCEL_TOKEN` | autentica leitura e deployment de projetos `git-managed`/Vercel |
| `VERCEL_TEAM_ID` | escopo opcional de time quando necessário |

Configure essas variáveis preferencialmente em `.env.local` na raiz do Dev Dashboard:

```dotenv
VERCEL_TOKEN=...
VERCEL_TEAM_ID=team_...
```

`npm run dev` carrega `.env.local` automaticamente. Reinicie o processo depois de mudar o arquivo.

Nunca publique o conteúdo de `.env.local`. O token não pertence a `.dev-dashboard/production.json` e não deve aparecer em issue, PR, screenshot ou log.

## Arquivos locais

Configuração:

```text
~/.config/dev-dashboard/
├── config.json
├── api-token
└── preferências locais
```

Estado:

```text
~/.local/state/dev-dashboard/
├── processes/
├── logs/
├── deployments/
├── históricos de testes/scripts
└── snapshots de banco
```

Diretórios privados usam `0700`; arquivos privados, `0600`.

Deployments persistem timeline/log/histórico, mas **não** token de confirmação nem credenciais Vercel.

## Diagnóstico inicial

```bash
npm run doctor
curl -i http://127.0.0.1:4343/api/health
```

Se a web estiver em desenvolvimento, abra `http://127.0.0.1:5173`.

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

Use uma versão compatível com `package.json`.

### Package compartilhado desatualizado

```bash
npm run build:packages
```

Depois rode o typecheck do workspace que falhou.

## Porta ocupada

```bash
ss -ltnp | grep ':4343\|:5173'
```

Não encerre um PID sem confirmar sua identidade.

## Dashboard abre, mas API falha

Confira:

1. API em `127.0.0.1:4343`;
2. web em `127.0.0.1:5173` no modo Vite;
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

`strategy=disabled` é deliberado. Leia `reasonCode`, `blockedBy` e o documento indicado pelo contrato.

O próprio Dev Dashboard permanece nesse estado para self-production até existir helper externo de restart/handoff.

## Vercel: integração não configurada

Sintoma na UI:

```text
Integração Vercel não configurada
```

Confirme **sem imprimir o token**:

```bash
cd /caminho/do/dev-dashboard
test -f .env.local && echo '.env.local existe'
```

Depois reinicie:

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

Não promova deployment antigo cegamente se o schema já avançou.

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
