# Dev Dashboard

Dashboard local para gerenciar projetos de desenvolvimento e operar contratos de produção pelo terminal e pelo navegador.

O Dev Dashboard detecta aplicações Rails e Node em workspaces locais, centraliza Git, processos, testes, banco, dependências e logs e, quando um projeto opta por um `Production Contract v1`, oferece uma superfície de **Produção** com planejamento, confirmação, timeline, recovery e integração Vercel.

> O CLI Bash original continua disponível como interface complementar à aplicação web.

## Recursos disponíveis

- descoberta automática de projetos Rails e Node;
- múltiplos workspaces persistentes;
- capabilities por projeto;
- servidores/processos locais com identidade, portas e logs controlados;
- Git com status, diff, branches, commits, sincronização, PRs e mutações com confirmação;
- testes reconhecidos, histórico e acompanhamento em tempo real;
- Rails migrations/routes, Bundler e dependências;
- serviços Docker Compose, Sidekiq e webpack quando reconhecidos;
- inspeção de bancos, snapshots e restore com confirmação;
- perfis/variáveis de ambiente sem persistência indevida de segredos;
- Project Doctor e diagnóstico de portas;
- terminal/console com salvaguardas próprias;
- Production Contract v1 fail-closed;
- deployments `strategy=command` para providers locais via scripts `prod:*`;
- deployments `strategy=git-managed` + Vercel com `provider-deploy` explícito;
- comparação de revision/drift de produção;
- retry seguro de somente `prod:verify` quando a promoção já concluiu;
- histórico/log de deployment e `recovery_required` após risco irreversível;
- API Fastify local, web Vue 3 e contratos TypeScript compartilhados;
- testes unitários, componentes e smoke E2E.

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

A API é a fronteira de segurança. Ações estruturadas não aceitam uma linha de shell livre do navegador.

Mais detalhes: [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Requisitos

- Linux;
- Bash 4+;
- Node.js `^20.19.0 || >=22.12.0`;
- npm;
- Git.

Projetos gerenciados precisam dos próprios runtimes e ferramentas. O desenvolvimento atual é validado com Node.js 24.

## Instalação

```bash
git clone git@github.com:felipe-urgal/dev-dashboard.git ~/.dev-dashboard
cd ~/.dev-dashboard
npm install
npm run doctor
```

## Desenvolvimento

```bash
npm run dev
```

Serviços padrão:

```text
API: http://127.0.0.1:4343
Web: http://127.0.0.1:5173
```

Para executar separadamente:

```bash
npm run dev:api
npm run dev:web
```

`npm run dev` compila os packages pelo `predev` e carrega `.env.local` na raiz quando presente.

Para começar uma configuração local sem versionar segredos:

```bash
cp .env.example .env.local
```

O `.env.example` contém somente exemplos/defaults e deixa variáveis internas/efêmeras explicitamente fora da configuração manual.

## Configuração da Vercel

Somente necessária para consultar/operar projetos com `strategy=git-managed` + `provider=vercel`.

Crie sua configuração local a partir do exemplo:

```bash
cp .env.example .env.local
```

Depois preencha em `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional quando o projeto pertence a time que exige escopo explícito:
VERCEL_TEAM_ID=team_...
```

Reinicie `npm run dev` depois de alterar o arquivo.

Nunca coloque essas credenciais no `production.json`, em issues/PRs ou em logs. Sem `VERCEL_TOKEN`, o provider fica `not-configured` e mutações externas permanecem bloqueadas.

## Workspaces

Um workspace é uma pasta que contém projetos. O cadastro fica em:

```text
~/.config/dev-dashboard/config.json
```

Também são respeitados:

```text
DEV_DASHBOARD_CONFIG_DIR
XDG_CONFIG_HOME
```

O scanner identifica Rails por `Gemfile` com a gem `rails` e Node por `package.json`. Capabilities aparecem somente quando o recurso correspondente é reconhecido.

Um projeto pode optar por produção criando:

```text
.dev-dashboard/production.json
```

O manifesto inválido não cria capability `production`; o projeto continua detectado com warning estruturado.

## Produção

### `strategy=command`

Providers locais, como systemd e Docker Compose, mantêm a implementação dentro do próprio projeto. O Dashboard executa somente scripts canônicos reconhecidos, por exemplo:

```text
prod:check → prod:backup? → prod:migrate? → prod:deploy → prod:verify
```

### `strategy=git-managed` + Vercel

Não existe `prod:deploy` local artificial. O plano usa:

```text
prod:check → prod:migrate? → provider-deploy → prod:verify
```

Antes de `provider-deploy`, o backend consulta diretamente `origin/<production.branch>` e exige que o SHA continue igual à revision confirmada. A Vercel recebe o SHA exato, não apenas uma branch móvel.

Fluxo na UI:

```text
Preparar deployment
        ↓
revisar branch + SHA + etapas
        ↓
Confirmar e iniciar
        ↓
acompanhar timeline/log
        ↓
succeeded | failed | cancelled | recovery_required
```

`READY` da Vercel encerra a etapa do provider, mas `prod:verify` continua responsável pela verificação funcional.

Se somente o verify falhar depois de uma promoção concluída, o Dashboard pode oferecer **Verificar novamente**, repetindo apenas `prod:verify` quando o backend comprova que o caso ainda é seguro.

Veja:

- [`docs/guia/producao.md`](docs/guia/producao.md)
- [`docs/deployment-operations.md`](docs/deployment-operations.md)
- [`docs/architecture/production-contract.md`](docs/architecture/production-contract.md)
- [`docs/architecture/deployment-domain.md`](docs/architecture/deployment-domain.md)

## Self-production

O próprio Dev Dashboard continua declarando produção **desabilitada** (`production.enabled=false`, `strategy=disabled`, `provider=none`).

A base segura já existe: handoff persistente, agent instalado fora da checkout, lifecycle independente do Fastify e Unix socket autenticado foram entregues pelos PRs #520/#521.

O PR #523 adiciona a integração interna API → agent e um worker instalado para preflight Git, aplicação fast-forward da revision confirmada, restart user-space e persistência de recovery. Isso **ainda não habilita** self-production.

Antes de abrir o gate faltam fechar e provar end-to-end, no mínimo:

- ownership operacional antes da API antiga parar;
- readiness pós-restart com timeout bounded;
- prova de que a nova API corresponde exatamente à revision confirmada;
- resultado terminal recuperável após restart real;
- teste real de interrupção/restart/recovery;
- revisão final do modelo de privilégio/segurança.

Veja [`docs/architecture/self-production.md`](docs/architecture/self-production.md).

## Segurança

A API escuta somente em `127.0.0.1` e rotas privadas exigem autenticação local. O token persistente fica em:

```text
~/.config/dev-dashboard/api-token
```

A aplicação também aplica:

- allowlist explícita de origem;
- schemas HTTP fechados;
- catálogo fechado de ações;
- `shell: false` quando aplicável;
- paths/cwd derivados de projetos conhecidos;
- confirmação para mutações sensíveis;
- masking e limites de logs;
- plano/revision revalidados antes de production deploy;
- prova do `origin` real antes de promoção Vercel;
- credenciais externas fora do manifesto e da API pública;
- recovery conservador após etapa irreversível.

O self-update mantém uma fronteira própria: o socket remoto não oferece executor genérico, e o worker operacional só aceita um handoff já validado, com checkout/revision revalidados antes da mutação.

Leia [`docs/architecture/security.md`](docs/architecture/security.md) antes de adicionar novas rotas, comandos ou providers.

## Estado local

Processos/logs e demais históricos ficam sob:

```text
~/.local/state/dev-dashboard
```

Alternativas:

```text
DEV_DASHBOARD_STATE_DIR
XDG_STATE_HOME
```

Deployments usam o subdiretório privado `deployments/`. Self-update usa `self-update/` para handoffs/resultados estruturados. Tokens de confirmação, senha sudo e credenciais Vercel não são persistidos ali.

A instalação padrão do self-update agent fica fora da checkout:

```text
~/.local/lib/dev-dashboard/self-update-agent
```

## Distribuição local

Para compilar e servir API + frontend estático sem Vite:

```bash
npm run dev-web
```

O comando gera um bootstrap efêmero para a sessão do navegador e mantém a API em loopback.

## Validação

Antes de finalizar uma mudança relevante:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
```

Para mudanças no fluxo web:

```bash
npm run test:e2e
```

Quando rotas/schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada; não edite manualmente.

## Scripts principais

| Comando | O que faz |
| --- | --- |
| `npm run dev` | inicia API e web, carregando `.env.local` quando existir |
| `npm run dev:api` | inicia somente a API |
| `npm run dev:web` | inicia somente o Vite |
| `npm run dev-web` | build + distribuição local em uma porta |
| `npm run doctor` | diagnostica Node/npm/Git/portas |
| `npm run docs:api` | regenera a referência HTTP |
| `npm run docs:api:check` | valida a referência gerada |
| `npm run prod:status` | mostra o gate/estado do contrato do próprio Dashboard |
| `npm run prod:check` | valida o gate; falha enquanto self-production estiver desabilitada |
| `npm run self-update:helper -- ...` | tooling de engenharia do handoff persistente |
| `npm run self-update:agent -- ...` | instala/controla/inspeciona o agent de self-update |
| `npm run typecheck` | valida tipos |
| `npm run lint` | executa ESLint |
| `npm run format:check` | verifica formatação |
| `npm run build` | compila packages e apps |
| `npm test` | executa testes dos workspaces |
| `npm run test:cli` | executa suíte Bash |
| `npm run test:e2e` | executa smoke E2E da web |

Os comandos de self-update continuam tooling de engenharia enquanto o contrato estiver `strategy=disabled`; não devem ser usados como atalho para contornar o fluxo de produção.

## Documentação

Comece por [`docs/index.md`](docs/index.md). O guia aba por aba fica em [`docs/guia/README.md`](docs/guia/README.md).

Planejamento futuro vive em issues e PRs do GitHub; `docs/` descreve o comportamento implementado.

## Licença

MIT — ver [`LICENSE`](LICENSE).
