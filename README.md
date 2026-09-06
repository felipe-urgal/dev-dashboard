# Dev Dashboard

Dashboard local para gerenciar projetos de desenvolvimento e operar contratos de produção pelo terminal e pelo navegador.

O Dev Dashboard detecta aplicações Rails e Node em workspaces locais, centraliza Git, processos, testes, banco, dependências e logs e, quando um projeto opta por um `Production Contract v1`, oferece uma superfície de **Produção** com planejamento, confirmação, timeline, recovery e providers explícitos.

> O CLI Bash original continua disponível como interface complementar à aplicação web.

## Recursos

- descoberta automática de projetos Rails e Node;
- múltiplos workspaces e capabilities por projeto;
- processos locais, portas e logs controlados;
- Git com status, diff, branches, commits, sincronização, PRs e mutações confirmadas;
- testes, histórico e acompanhamento em tempo real;
- Rails migrations/routes, dependências e serviços reconhecidos;
- inspeção de bancos, snapshots e restore com confirmação;
- Production Contract v1 fail-closed;
- `strategy=command` para scripts `prod:*` de projetos locais;
- `strategy=git-managed` + Vercel sem `prod:deploy` artificial;
- `strategy=self-update` fechado para a produção do próprio Dashboard;
- histórico/recovery de deployments;
- API Fastify local, web Vue 3 e contratos TypeScript compartilhados.

## Arquitetura

```text
CLI Bash                        Dashboard Vue
   │                                 │
   │                                 ▼
   │                           API Fastify local
   │                                 │
   └──────────────┬──────────────────┘
                  ▼
 contracts │ core │ project-discovery │ process-manager
 Git │ deployment │ testes │ banco │ Rails │ arquivos
                  │
          ┌───────┴────────┐
          ▼                ▼
 sistema/repositórios   providers explícitos
 locais                (Vercel)
```

A API é a fronteira de segurança. Ações estruturadas não aceitam linha de shell livre do navegador.

Mais detalhes: [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Requisitos

- Linux;
- Bash 4+;
- Node.js `^20.19.0 || >=22.12.0`;
- npm;
- Git.

O CI principal usa Node 24. Mudanças de runtime/dependências devem validar Node 20.19.0 separadamente quando houver risco de incompatibilidade.

## Instalação

```bash
git clone git@github.com:felipe-urgal/dev-dashboard.git ~/.dev-dashboard
cd ~/.dev-dashboard
npm ci
npm run doctor
```

### Instalação local automática no Linux

Para deixar o Dashboard disponível após o login, sem iniciar o processo manualmente:

```bash
npm run local:install
```

O instalador cria uma unit `systemd --user`, mantém o listener exclusivamente em `127.0.0.1` e publica a distribuição local em:

```text
http://dev-dashboard.localhost:4343
```

Comandos de operação:

```bash
npm run local:status
npm run local:open
npm run local:uninstall
```

`local:install` é idempotente, não exige `sudo`, usa o caminho absoluto do Node ativo e não depende do shell profile no login. Ao reinstalar, ele recompila a distribuição, executa `systemctl --user restart dev-dashboard.service` e só conclui depois que `/api/health` fica saudável. `local:uninstall` remove somente a integração gerenciada; checkout, configuração e estado do Dashboard são preservados.

No modo instalado, porta e origem são congeladas nos metadados da instalação para evitar divergência com a unit. Outras variáveis úteis do `.env.local`, como credenciais opcionais da Vercel, continuam disponíveis ao runtime. Para mudar a porta instalada, ajuste o ambiente e execute `npm run local:install` novamente.

Guia completo: [`docs/local-installation.md`](docs/local-installation.md).

## Desenvolvimento

A receita canônica está em [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

Quickstart:

```bash
npm run dev
```

Serviços padrão:

```text
API: http://127.0.0.1:4343
Web: http://127.0.0.1:5174
```

Para configuração local:

```bash
cp .env.example .env.local
```

`npm run dev` compila packages pelo `predev` e carrega `.env.local` quando presente.

Modos adicionais:

```bash
npm run dev:api
npm run dev:web
npm run dev-web
```

`dev-web` serve a distribuição local compilada sem Vite; ele não substitui o modo HMR normal.

## Gate antes do PR

```bash
npm run check
```

O gate canônico atual executa:

```text
format:check
-> lint
-> test
-> build:apps
```

O CI usa exatamente essa interface depois da instalação/preparação nativa.

Checks direcionados:

```bash
npm run typecheck
npm run test:cli
npm run test:e2e
npm run test:coverage
```

`npm run format:check` também pode ser executado isoladamente para diagnóstico, mas já faz parte de `npm run check`.

Coverage é diagnóstico, não percentual mínimo de aprovação. Veja [`docs/testing-and-quality.md`](docs/testing-and-quality.md).

Quando rotas/schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada; não edite manualmente.

## Configuração da Vercel

Somente necessária para projetos gerenciados com `strategy=git-managed` + `provider=vercel`.

Em `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional para time/escopo explícito
VERCEL_TEAM_ID=team_...
```

Nunca coloque essas credenciais no `production.json`, issue, PR ou log. Sem token, o provider fica `not-configured` e mutações externas permanecem bloqueadas.

## Workspaces

Configuração persistida em:

```text
~/.config/dev-dashboard/config.json
```

Também são respeitados `DEV_DASHBOARD_CONFIG_DIR` e `XDG_CONFIG_HOME`.

Um projeto opta por produção criando:

```text
.dev-dashboard/production.json
```

Manifesto inválido não cria capability `production`; o projeto continua detectado com warning estruturado.

## Produção de projetos gerenciados

### `strategy=command`

O projeto alvo mantém a implementação em scripts canônicos `prod:*`:

```text
prod:check -> prod:backup? -> prod:migrate? -> prod:deploy -> prod:verify
```

### `strategy=git-managed`

Não existe `prod:deploy` local artificial. Com Vercel:

```text
prod:check -> prod:migrate? -> provider-deploy -> prod:verify
```

Antes da promoção, o backend revalida `origin/<production.branch>` e exige o SHA confirmado. Provider READY é diferente de `prod:verify`.

Fluxo na UI:

```text
Preparar deployment
-> revisar branch + SHA + etapas
-> confirmar
-> acompanhar timeline/log
-> succeeded | failed | cancelled | recovery_required
```

Veja:

- [`docs/guia/producao.md`](docs/guia/producao.md);
- [`docs/deployment-operations.md`](docs/deployment-operations.md);
- [`docs/architecture/production-contract.md`](docs/architecture/production-contract.md);
- [`docs/architecture/deployment-domain.md`](docs/architecture/deployment-domain.md).

## Produção do próprio Dev Dashboard

A receita canônica está em [`docs/PRODUCTION.md`](docs/PRODUCTION.md).

O contrato é:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

Comandos locais disponíveis:

```bash
npm run prod:status
npm run prod:check
```

Não existe `npm run prod:deploy` para o próprio Dashboard. A mutação ocorre pela aba Produção, usando planner, confirmação vinculada ao `planHash`, handoff para agent externo, fast-forward da revision confirmada, restart e prova de readiness + revision.

Em uma instalação gerenciada, o handoff propaga revision alvo e raiz canônica da checkout; `dev-web.mjs` só delega o restart para a unit fixa `dev-dashboard.service` quando metadados e ownership da mesma instalação são comprovados.

Os scripts `self-update:*` são tooling de engenharia; não constituem bypass da autorização normal do domínio.

Detalhes: [`docs/architecture/self-production.md`](docs/architecture/self-production.md).

## Segurança

A API escuta somente em `127.0.0.1` e rotas privadas exigem autenticação local. O token persistente fica em:

```text
~/.config/dev-dashboard/api-token
```

Na distribuição compilada, a capacidade efêmera de bootstrap é injetada apenas no HTML servido em runtime e gravada diretamente no `sessionStorage` da aba; a URL não contém `#bootstrap=...`.

Guardrails principais:

- allowlist de origem;
- schemas HTTP fechados;
- catálogo fechado de ações;
- `shell: false` quando aplicável;
- paths/cwd derivados de projetos conhecidos;
- confirmação para mutações sensíveis;
- masking e limites de logs;
- plano/revision revalidados antes de deployment;
- credenciais externas fora do manifesto/API pública;
- recovery conservador após etapa irreversível;
- self-update sem executor remoto genérico e com prova da revision final.

Leia [`docs/architecture/security.md`](docs/architecture/security.md) antes de adicionar novas rotas, comandos ou providers.

## Estado local

Estado e históricos ficam sob:

```text
~/.local/state/dev-dashboard
```

Alternativas: `DEV_DASHBOARD_STATE_DIR` e `XDG_STATE_HOME`.

O self-update agent padrão fica fora da checkout:

```text
~/.local/lib/dev-dashboard/self-update-agent
```

Tokens de confirmação, senha sudo e credenciais Vercel não são persistidos no estado de deployment.

## Scripts principais

| Comando | Uso |
| --- | --- |
| `npm run dev` | API + web com watch |
| `npm run dev:api` | somente API |
| `npm run dev:web` | somente Vite |
| `npm run dev-web` | distribuição local compilada |
| `npm run local:install` | instala/reinstala o runtime local via systemd user, reinicia e espera health |
| `npm run local:status` | mostra estado da instalação, serviço, health e URL |
| `npm run local:open` | abre a URL amigável instalada |
| `npm run local:uninstall` | remove apenas a integração local gerenciada |
| `npm run doctor` | diagnóstico local |
| `npm run check` | gate obrigatório do PR/CI |
| `npm run docs:api` | regenera referência HTTP |
| `npm run docs:api:check` | valida referência gerada |
| `npm run prod:status` | estado do self-production contract |
| `npm run prod:check` | preflight do self-update instalado |
| `npm run self-update:helper -- ...` | tooling de handoff |
| `npm run self-update:agent -- ...` | tooling do agent |
| `npm run typecheck` | validação isolada de tipos |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier sem rewrite; também faz parte de `check` |
| `npm run build` | packages + apps |
| `npm test` | suítes funcionais sem coverage |
| `npm run test:coverage` | coverage sob demanda |
| `npm run test:cli` | suíte Bash |
| `npm run test:e2e` | E2E web direcionado |

## Documentação

Comece por:

- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup, desenvolvimento e gate de PR;
- [`docs/local-installation.md`](docs/local-installation.md) — runtime permanente no Linux;
- [`docs/PRODUCTION.md`](docs/PRODUCTION.md) — produção do próprio Dashboard;
- [`docs/index.md`](docs/index.md) — mapa geral;
- [`docs/guia/README.md`](docs/guia/README.md) — guia por funcionalidade;
- [`docs/testing-and-quality.md`](docs/testing-and-quality.md) — política de testes.

Planejamento futuro vive em issues/PRs; `docs/` descreve comportamento implementado.

## Licença

MIT — ver [`LICENSE`](LICENSE).
