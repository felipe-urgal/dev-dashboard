# Visão geral da arquitetura

## Contexto

O Dev Dashboard nasceu como scripts Bash carregados no shell e evoluiu para uma segunda interface web local. As duas interfaces continuam válidas: o CLI preserva fluxos existentes e a aplicação web concentra operações estruturadas por uma API Fastify.

Além do desenvolvimento local, a arquitetura atual inclui um domínio próprio de **deployment de produção** baseado em `Production Contract v1`. Cada projeto continua dono de sua infraestrutura física; o Dashboard padroniza contrato, plano, confirmação, timeline, provider e recovery.

## Objetivos arquiteturais

A arquitetura deve:

- preservar o CLI existente;
- manter API/web local-first;
- suportar múltiplos workspaces e projetos Rails/Node;
- impedir shell arbitrário em ações estruturadas;
- compartilhar contratos entre frontend/backend;
- acompanhar processos/logs/estado de forma limitada;
- usar confirmação/revalidação para mutações sensíveis;
- operar produção sem hard-code por nome de repositório;
- representar provider, revision, health e recovery de forma honesta;
- permitir testes isolados de regras, adapters e fluxos críticos.

## Visão de alto nível

```text
┌─────────────────────────────────────────────────────────────┐
│ Interfaces                                                  │
├────────────────────────────┬────────────────────────────────┤
│ CLI Bash                   │ Dashboard Vue 3                │
│ lib/ + init.sh             │ http://127.0.0.1:5173         │
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
│ packages/contracts │ core │ project-discovery              │
│ process-manager │ Git │ deployment │ testes │ banco         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                  ┌───────────┴────────────┐
                  ▼                        ▼
        sistema/repositórios        providers explícitos
        locais                      (Vercel)
```

Para self-update existe ainda uma fronteira separada da API:

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

Essa cadeia existe para permitir que a API antiga pare sem ser a única dona do estado da operação.

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

A API escuta em `127.0.0.1`.

O PR #523 adiciona `SelfUpdateHandoffService` como serviço interno do backend. Ele não cria uma rota pública de self-update nem ignora `strategy=disabled`; serve para preparar/transferir handoff e iniciar tooling fechado quando a futura integração do fluxo de self-production estiver autorizada.

## Contratos compartilhados

`packages/contracts` contém tipos puros como `Workspace`, `Project`, processos, testes e contratos de deployment/produção.

O package não deve importar infraestrutura, Fastify ou Vue.

## Core

`packages/core` concentra configuração de workspaces, IDs e token local. Não depende das aplicações.

## Project Discovery

`packages/project-discovery` detecta projetos Rails/Node e capabilities. O scan pode ser direto ou recursivo opt-in com limites de profundidade, quantidade e tempo.

Quando `.dev-dashboard/production.json` existe, o discovery valida o `Production Contract v1` contra shape/estratégia/scripts reais. Contrato inválido gera `productionWarning` e não cria capability `production`.

## Process Manager

`packages/process-manager` cuida de processos de desenvolvimento: comando reconhecido, `cwd`, porta, identidade, lifecycle e logs limitados.

**Deployment não é um tipo de processo gerenciado.** Ele possui domínio próprio porque precisa de revision, plano, confirmação, irreversibilidade, provider externo e recovery.

O self-update worker também não é representado como processo gerenciado comum: ele precisa sobreviver à API antiga, usa estado/handoff próprio e executa a partir da release instalada do agent.

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

Providers locais como systemd/Docker Compose expõem scripts canônicos `prod:*` e o projeto esconde os detalhes físicos.

```text
check → backup? → migrate? → deploy → verify
```

### `strategy=git-managed` + Vercel

Não existe `prod:deploy` local. O plano usa uma etapa externa:

```text
check → migrate? → provider-deploy → verify
```

Antes da promoção, o backend consulta diretamente `origin/<production.branch>` e exige o mesmo SHA confirmado no plano. A Vercel recebe o SHA exato e a origem GitHub resolvida no backend.

`READY` do provider não substitui `prod:verify`.

### Estado/recovery

Timeline/histórico/log são compartilhados pelas estratégias. Se uma etapa irreversível já iniciou, falha/cancelamento/crash pode terminar em `recovery_required`.

Quando a promoção concluiu e somente `verify` falhou, existe retry fail-closed de apenas `prod:verify`, sem repetir mutação.

## Integração Vercel

Credenciais são locais ao processo:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID   # opcional
```

`npm run dev` carrega `.env.local` quando presente. `.env.example` documenta as variáveis locais configuráveis sem conter segredo real.

O token não pertence ao Production Contract, não é persistido e não volta ao browser.

O adapter limita/valida respostas externas e transforma auth/quota/not-found/indisponibilidade/resposta inválida em códigos estáveis.

## Persistência

Configuração padrão:

```text
~/.config/dev-dashboard
```

Estado padrão:

```text
~/.local/state/dev-dashboard
```

Subdomínios mantêm stores próprios sob essa raiz, incluindo `processes/`, `logs/`, `deployments/` e `self-update/`. Arquivos privados usam permissões restritas.

O estado de self-update contém somente metadados estruturados de handoff/recovery; não persiste shell, unit/path de autoridade, senha ou credencial.

O self-update agent possui ainda:

- token local próprio em configuração privada;
- runtime Unix socket `0600` em diretório `0700`;
- releases instaladas por hash fora da árvore do repositório, por padrão em `~/.local/lib/dev-dashboard/self-update-agent/`;
- lock privado para exclusividade da execução operacional.

Tokens de confirmação, senha sudo e credenciais Vercel não são persistidos.

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

No self-update, a mesma regra continua válida: o socket remoto não ganha um executor genérico. A execução operacional aceita somente um handoff ID já validado, revalida a checkout e usa Git/restart fixos definidos pelo backend/tooling.

Veja [security.md](security.md).

## Self-production

O próprio Dev Dashboard possui contrato fail-closed `strategy=disabled`.

### Base já entregue

Os PRs #520/#521 entregaram:

- handoff persistente;
- recovery conservador;
- agent instalado fora da checkout;
- lifecycle independente do Fastify;
- Unix socket autenticado;
- catálogo remoto fechado `ping`, `inspect`, `claim`, `recover`.

### PR C em andamento

O PR #523 adiciona:

- integração interna API → helper/agent;
- worker instalado independente da API antiga;
- preflight de working tree limpa + `main` + `origin/main` exato + fast-forward;
- aplicação por `git merge --ff-only` da revision confirmada;
- reinstalação da release do agent após aplicar;
- restart user-space por `scripts/dev-web.mjs`;
- transições `applying/restarting/verifying` e resultado/recovery persistido.

O gate ainda continua fechado.

A prova end-to-end de readiness/revision não está concluída: o worker já exige que `/api/health` prove a `targetRevision`, mas a resposta HTTP pública atual ainda não expõe esse campo. O #523 precisa fechar essa divergência e executar o teste real de interrupção/restart/recovery antes de o PR D avaliar habilitação.

O fluxo atual não usa `sudo` nem `systemctl`; o modelo final de privilégio precisa continuar auditável e mínimo.

Veja [self-production.md](self-production.md).

## Documentos relacionados

- [Production Contract v1](production-contract.md)
- [Domínio de deployment](deployment-domain.md)
- [Fluxos runtime](runtime-flows.md)
- [Segurança](security.md)
- [Self-production](self-production.md)
- [Operação de deployments](../deployment-operations.md)
- [Operação e troubleshooting](../operations-and-troubleshooting.md)
- [Interface de Produção](../production-ui.md)
