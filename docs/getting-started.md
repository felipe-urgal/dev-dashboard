# Primeiros passos

Este guia leva de um clone limpo até a primeira execução do Dev Dashboard e explica a configuração opcional para operar projetos com Production Contract.

## Requisitos

- Linux;
- Bash 4+;
- Node.js `20.19+` ou `22.12+`;
- npm;
- Git.

O desenvolvimento é validado principalmente com Node.js 24.

Projetos gerenciados continuam responsáveis pelos próprios runtimes: Ruby/Bundler/Rails, Node/gerenciador do lockfile, bancos, Docker e ferramentas exigidas por seus scripts.

## Instalação

```bash
git clone git@github.com:felipe-urgal/dev-dashboard.git ~/.dev-dashboard
cd ~/.dev-dashboard
npm install
npm run doctor
```

## Desenvolvimento completo

```bash
npm run dev
```

URLs padrão:

```text
API:           http://127.0.0.1:4343
Dashboard web: http://127.0.0.1:5173
```

`predev` compila os pacotes compartilhados. `scripts/dev.mjs` também carrega `.env.local` na raiz quando o arquivo existe.

Use `Ctrl+C` para encerrar API e web em conjunto.

Para investigar separadamente:

```bash
npm run dev:api
npm run dev:web
```

## Primeiro uso

1. Abra `http://127.0.0.1:5173`.
2. Cadastre um workspace, como `/home/usuario/Projetos`.
3. Execute o scan.
4. Abra um projeto detectado.
5. Use somente as abas/capabilities que o projeto expõe.

Um projeto Rails possui `Gemfile` com a gem `rails`; um projeto Node possui `package.json`.

Capabilities comuns incluem:

```text
server
git
tests
database
scripts
webpack
sidekiq
rake
bundler
production
```

`production` só aparece quando `.dev-dashboard/production.json` existe e passa pela validação fail-closed do Production Contract v1.

## Configuração opcional da Vercel

Você só precisa configurar Vercel no **Dev Dashboard** se quiser consultar ou executar deployments de projetos cujo contrato declare:

```text
strategy=git-managed
provider=vercel
```

Na raiz do Dev Dashboard, crie `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional quando o projeto está sob time que exige escopo explícito:
VERCEL_TEAM_ID=team_...
```

Depois reinicie `npm run dev`.

Regras:

- não versione `.env.local`;
- não coloque o token no manifesto do projeto;
- não cole o token em logs/issues/PRs;
- `VERCEL_TEAM_ID` só é necessário quando o escopo realmente exigir.

Sem `VERCEL_TOKEN`, projetos Vercel continuam visíveis, mas a integração externa fica `not-configured` e a mutação permanece bloqueada.

## Como funciona a aba Produção

Com um contrato habilitado, a aba **Produção** pode mostrar revision, provider, health/readiness e drift.

Para executar:

```text
Preparar deployment
  ↓
revisar branch + SHA + etapas
  ↓
Confirmar e iniciar
  ↓
acompanhar timeline/log
```

Em providers locais `strategy=command`, a promoção usa `prod:deploy` do próprio projeto. Em Vercel `git-managed`, a promoção aparece como `provider-deploy`: o backend confirma a revision real de `origin/<branch>` e envia o SHA exato à Vercel, depois roda `prod:verify`.

Veja [guia/producao.md](guia/producao.md) antes da primeira operação real.

## Autenticação local

A API gera um token em:

```text
~/.config/dev-dashboard/api-token
```

Em desenvolvimento, o proxy Vite o lê no processo Node e autentica requests para `/api`; o token não entra no bundle web.

Clientes de linha de comando precisam fornecer `X-Dev-Dashboard-Token` nas rotas privadas. `/api/health` permanece público.

## Diretórios locais

Configuração:

```text
~/.config/dev-dashboard
```

Alternativas:

```text
DEV_DASHBOARD_CONFIG_DIR
XDG_CONFIG_HOME
```

Estado/logs:

```text
~/.local/state/dev-dashboard
```

Alternativas:

```text
DEV_DASHBOARD_STATE_DIR
XDG_STATE_HOME
```

Arquivos privados usam permissões restritas ao usuário.

## Distribuição local compilada

```bash
npm run dev-web
```

Esse modo executa diagnóstico/build, serve o frontend estático pela API e usa bootstrap efêmero de navegador sem Vite.

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

Quando o fluxo web justificar:

```bash
npm run test:e2e
```

Rotas/schemas alterados também exigem:

```bash
npm run docs:api
npm run docs:api:check
```

## Próximas leituras

- [Guia do dashboard](guia/README.md)
- [Produção](guia/producao.md)
- [Production Contract v1](architecture/production-contract.md)
- [Domínio de deployment](architecture/deployment-domain.md)
- [Operação de deployments](deployment-operations.md)
- [Segurança](architecture/security.md)
- [Operação e troubleshooting](operations-and-troubleshooting.md)
