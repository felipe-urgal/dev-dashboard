# Visão geral da arquitetura

## Contexto

O Dev Dashboard nasceu como scripts Bash carregados no shell e evoluiu para uma aplicação web local. As duas interfaces continuam válidas: o CLI preserva fluxos existentes e a web concentra operações estruturadas por uma API Fastify.

Além do desenvolvimento local, a arquitetura inclui um domínio próprio de **deployment de produção** baseado em `Production Contract v1`. Cada projeto continua dono de sua infraestrutura física; o Dashboard padroniza contrato, plano, confirmação, timeline, provider e recovery.

O próprio Dev Dashboard usa `strategy=self-update` e pode ser instalado permanentemente no Linux via `systemd --user`.

## Objetivos arquiteturais

A arquitetura deve:

- preservar o CLI existente;
- manter API/web local-first;
- suportar múltiplos workspaces e projetos Rails/Node;
- impedir shell arbitrário em ações estruturadas;
- compartilhar contratos entre frontend/backend;
- acompanhar processos/logs/estado de forma limitada;
- usar confirmação/revalidação para mutações sensíveis;
- operar produção sem hard-code por nome de repositório do projeto alvo;
- representar provider, revision, health e recovery de forma honesta;
- permitir testes isolados de regras, adapters e fluxos críticos.

## Visão de alto nível

```text
┌─────────────────────────────────────────────────────────────┐
│ Interfaces                                                  │
├────────────────────────────┬────────────────────────────────┤
│ CLI Bash                   │ Dashboard Vue 3                │
│ lib/ + init.sh             │ http://127.0.0.1:5174         │
└─────────────┬──────────────┴──────────────┬─────────────────┘
              │                             │ HTTP/SSE/WS
              │                             ▼
              │                ┌──────────────────────────────┐
              │                │ API Fastify                  │
              │                │ http://127.0.0.1:4343       │
              │                └──────────────┬───────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│ contracts │ core │ project-discovery │ process-manager     │
│ Git │ deployment │ testes │ banco │ arquivos │ providers   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                  ┌───────────┴────────────┐
                  ▼                        ▼
        sistema/repositórios        providers explícitos
        locais                      (Vercel, Trivy, act...)
```

Para self-update existe uma fronteira separada da API:

```text
API atual
   ↓
handoff persistente
   ↓
self-update agent instalado + Unix socket autenticado
   ↓
worker instalado independente do Fastify
   ↓
Git/restart/readiness/recovery
```

Essa cadeia permite que a API antiga pare sem ser a única dona do estado da operação.

## Monorepo

```text
apps/
├── api/
└── web/

packages/
├── contracts/
├── core/
├── process-manager/
└── project-discovery/
```

Código de domínio específico da API fica em `apps/api/src`; contratos públicos compartilhados ficam em `packages/contracts`.

## Frontend

`apps/web` usa Vue 3, TypeScript e Vite.

Responsabilidades:

- apresentar workspaces/projetos/capabilities;
- chamar somente APIs estruturadas;
- acompanhar estado por HTTP/SSE/WS;
- representar loading/erro/sucesso reais;
- descartar respostas stale ao trocar de contexto;
- mostrar previews/confirmações antes de mutações sensíveis;
- nunca acessar filesystem/processos/provider diretamente.

## API local

`apps/api` usa Fastify + JSON Schema e é a fronteira de segurança entre navegador, sistema local e providers externos.

Responsabilidades incluem:

- autenticação/origem;
- workspaces e `ProjectStore`;
- Git/processos/testes/banco/filesystem;
- contratos e rotas de produção;
- adapters locais/externos;
- persistência de histórico/logs;
- tradução de erros para contratos públicos seguros.

A composição da API separa construção por domínio de lifecycle/registro de rotas para evitar um composition root monolítico. Serviços com recursos duradouros precisam de fechamento explícito.

A API escuta em `127.0.0.1`.

## Desenvolvimento vs instalação local

Desenvolvimento:

```text
npm run dev
→ API :4343
→ Vite :5174
```

Instalação permanente:

```text
npm run local:install
→ build
→ unit systemd --user
→ restart dev-dashboard.service
→ aguardar /api/health
→ http://dev-dashboard.localhost:4343
```

A unit usa caminho absoluto do Node e metadados privados de porta/origem. Não existe serviço root/system-wide.

## Autenticação da distribuição local

O token HTTP persistente não entra no bundle web.

Na distribuição compilada:

```text
API serve index.html em runtime
→ injeta capacidade efêmera somente no HTML in-memory
→ script grava diretamente em sessionStorage
→ aplicação cria browser-session
→ cookie HttpOnly
```

A URL permanece limpa; o servidor não gera `#bootstrap=...`.

## Contratos compartilhados

`packages/contracts` contém tipos puros de Workspace, Project, processos, testes e contratos de deployment/produção.

O package não deve importar infraestrutura, Fastify ou Vue.

## Core

`packages/core` concentra configuração de workspaces, IDs e token local. Não depende das aplicações.

## Project Discovery

`packages/project-discovery` detecta Rails/Node e capabilities. O scan pode ser direto ou recursivo opt-in com limites.

Quando `.dev-dashboard/production.json` existe, o discovery valida o `Production Contract v1` fail-closed. Contrato inválido gera `productionWarning` e não cria capability `production`.

Discovery deve permanecer read-only; providers podem enriquecer fatos sem executar mutação escondida.

## Process Manager

`packages/process-manager` cuida de processos de desenvolvimento: comando reconhecido, `cwd`, porta, identidade, lifecycle e logs limitados.

Invariantes:

- catálogo fechado;
- `shell:false` quando aplicável;
- persistência antes do retorno;
- validação de identidade antes de sinalizar PID;
- TERM antes de KILL;
- readiness de porta vinculada à árvore do processo no Linux;
- cleanup de recursos.

**Deployment não é processo gerenciado.** Ele possui domínio próprio porque precisa de revision, plano, confirmação, irreversibilidade, provider e recovery.

Self-update também possui lifecycle/store próprios porque o worker precisa sobreviver à API antiga.

## Execuções destacáveis

Testes completos, Migration Rails e Dependências/Build podem sobreviver à desconexão do navegador usando PTYs controlados. O resultado terminado permanece memória transitória bounded; execuções ativas não são evictadas por TTL/LRU.

## GitHub Cockpit

O resumo de PR é enriquecido sem criar uma segunda integração GitHub:

- `headSha`;
- draft/mergeability;
- reviews/reviewers;
- checks individuais;
- degradação explícita por auth/rate-limit/indisponibilidade.

Git local continua funcional se o provider remoto não puder ser consultado.

## Worktrees

O recorte atual de #570 é read-only: um observer usa Git estruturado para listar worktrees e gerar identidade estável por `git-common-dir + path`.

Criação/remoção e integração completa com runtime/ports/Environment Instance permanecem pendentes.

## Docker Compose

A #588 já possui modelo normalizado de configuração/runtime, provider read-only e preflight de portas integrado ao Port Registry.

Lifecycle mutável (`up/stop/restart/logs`), ownership e UI ainda são escopo aberto.

## Dependency Health

A #572 já possui inventário Node/npm local read-only, distinguindo range declarado de versão resolvida e tratando resolução ausente como `unknown`.

Metadata externa, advisories/compatibilidade e Upgrade Planner permanecem pendentes.

## Migration Providers

A #589 já possui contrato comum e providers de inspeção Rails, Prisma e custom.

API/UI comum e mutações compartilhadas permanecem pendentes.

## Security Center

A #593 já possui boundary de provider e adapter Trivy para secrets/misconfiguration com sanitização forte.

HTTP, persistência e UI ainda estão pendentes.

## Local CI com act

A #594 já possui discovery/catálogo/preflight de `act` + Docker com argv fechado.

Execução real, lifecycle, logs e UI permanecem pendentes. Qualquer resultado futuro continuará marcado como aproximação local, nunca CI remoto oficial.

## Release Readiness

A #571 já possui núcleo, agregação Git/Testes/Project Doctor e endpoint read-only por projeto.

Migrations, Production Contract, CI remoto e UI dedicada permanecem pendentes.

Readiness é evidência, não autorização para merge/deploy.

## Domínio de deployment

O domínio em `apps/api/src/deployment/` coordena:

```text
ProductionContractV1
        ↓
GitDeploymentRevisionResolver
        ↓
DeploymentPlanner
        ↓
DeploymentConfirmationService
        ↓
DeploymentService
        ├── ProductionCommandAdapter
        ├── VercelDeploymentAdapter
        ├── OriginRevisionResolver
        └── DeploymentStore
```

### `strategy=command`

```text
check → backup? → migrate? → deploy → verify
```

### `strategy=git-managed` + Vercel

```text
check → migrate? → provider-deploy → verify
```

Antes da promoção, o backend exige `origin/<production.branch>` igual ao SHA confirmado. A Vercel recebe a revision exata; `READY` não substitui `prod:verify`.

### `strategy=self-update`

O próprio Dev Dashboard usa:

```text
check → self-update
```

A etapa transfere ownership para agent/worker externo, aplica apenas fast-forward e exige health + revision exata depois do restart.

## Persistência

Configuração padrão:

```text
~/.config/dev-dashboard
```

Estado padrão:

```text
~/.local/state/dev-dashboard
```

Subdomínios mantêm stores próprios sob essa raiz, incluindo `processes/`, `logs/`, `deployments/` e `self-update/`.

O agent possui ainda:

```text
~/.local/lib/dev-dashboard/self-update-agent
```

Tokens de confirmação, senha sudo e credenciais Vercel não são persistidos no estado de deployment.

## Segurança

Princípios transversais:

- loopback + autenticação/origem;
- schemas fechados;
- IDs/catálogos em vez de comandos livres;
- paths/cwd canônicos;
- `shell:false` quando aplicável;
- preview + confirmação + revalidação;
- limites/masking de logs;
- prova de revision remota antes de promoção Vercel;
- provider externo tratado como input não confiável;
- recovery conservador após mutação irreversível.

No self-update, o socket remoto não ganha executor genérico. O browser não escolhe checkout, unit ou comando.

## Self-production e systemd user

O próprio Dashboard pode rodar de duas formas após self-update:

- runtime direto user-space;
- runtime gerenciado por `local:install`.

No segundo caso, o handoff pode usar somente:

```text
systemctl --user restart dev-dashboard.service
```

Isso exige metadados e marcador de ownership válidos. Não existe `sudo`/root nem unit configurável pelo browser.

A #654 trocou o handoff gerenciado de `start` para `restart`; #658 fez `local:install` reiniciar sempre após build e aguardar health; #656 removeu bootstrap da URL.

### Limitação conhecida #659

O redeploy gerenciado ainda possui um bug de propagação da raiz da checkout para `dev-web.mjs`. Na reprodução real, a API antiga encerrou e o serviço só voltou após restart manual, apesar de build e nova revision estarem corretos.

Enquanto #659 estiver aberta, esse caminho não deve ser considerado autossuficiente depois do shutdown. A correção precisa manter authority user-space e a unit fixa.

Veja [self-production.md](self-production.md), [../PRODUCTION.md](../PRODUCTION.md) e [../local-installation.md](../local-installation.md).

## Documentos relacionados

- [Production Contract v1](production-contract.md)
- [Domínio de deployment](deployment-domain.md)
- [Fluxos runtime](runtime-flows.md)
- [Segurança](security.md)
- [Self-production](self-production.md)
- [GitHub Cockpit](github-cockpit.md)
- [Release Readiness](release-readiness.md)
- [Docker Compose](docker-compose.md)
- [Worktrees](git-worktrees.md)
- [Operação de deployments](../deployment-operations.md)
- [Operação e troubleshooting](../operations-and-troubleshooting.md)
- [Interface de Produção](../production-ui.md)
