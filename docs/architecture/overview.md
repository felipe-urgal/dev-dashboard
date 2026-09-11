# Visão geral da arquitetura

## Contexto

O Dev Dashboard começou como scripts Bash carregados no shell e evoluiu para uma aplicação web local. As duas interfaces continuam válidas: o CLI preserva fluxos existentes e a web concentra descoberta, contexto e operações estruturadas por uma API Fastify.

A arquitetura é **local-first**. O browser não recebe autoridade para escolher shell, `cwd`, paths absolutos, executáveis ou credenciais livres. A API é a fronteira que resolve recursos conhecidos, aplica contratos, validações, ownership, confirmação e recovery.

O estado detalhado de cada feature fica no documento do domínio e, quando houver trabalho pendente, na issue correspondente. Este overview descreve apenas fronteiras e decisões estáveis.

## Visão de alto nível

```text
┌─────────────────────────────────────────────────────────────┐
│ Interfaces                                                  │
├────────────────────────────┬────────────────────────────────┤
│ CLI Bash                   │ Dashboard Vue 3                │
│ lib/ + init.sh             │ Vite / distribuição local      │
└─────────────┬──────────────┴──────────────┬─────────────────┘
              │                             │ HTTP/SSE/WS
              │                             ▼
              │                ┌──────────────────────────────┐
              │                │ API Fastify local            │
              │                └──────────────┬───────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│ contracts │ domínio │ discovery │ processos │ Git │ dados  │
│ execução │ deployment │ providers │ persistência           │
└─────────────────────────────┬───────────────────────────────┘
                              │
                  ┌───────────┴────────────┐
                  ▼                        ▼
        sistema/repositórios        providers explícitos
        locais                      e degradáveis
```

## Monorepo e responsabilidades

```text
apps/
├── api/    # transporte, composição, serviços/adapters locais
└── web/    # Vue, navegação, estado e apresentação

packages/
└── ...     # contratos e regras reutilizáveis sem dependência de Vue/Fastify
```

Regras compartilhadas e contratos públicos devem ficar fora das views e das rotas quando possuem valor independente. Integração concreta, persistência e lifecycle pertencem ao domínio que possui o recurso.

Não crie uma engine universal apenas para uniformizar implementações que possuem ownership, segurança ou recovery diferentes.

## Frontend

`apps/web` usa Vue 3, TypeScript e Vite.

Responsabilidades:

- apresentar workspaces, projetos, capabilities e estado real;
- chamar APIs estruturadas;
- representar loading, vazio, erro e sucesso honestamente;
- lidar com respostas stale ao trocar de contexto;
- acompanhar estado por snapshot, SSE, WS ou polling conforme a fonte adequada;
- mostrar preview/confirmação quando a mutação exigir;
- manter ações no contexto em que são usadas.

O frontend não acessa filesystem, processos ou providers diretamente.

A política de estado vivo está em [`frontend-live-state.md`](frontend-live-state.md).

## API e fronteira de segurança

`apps/api` usa Fastify + JSON Schema e media navegador, sistema local e providers externos.

Princípios transversais:

- loopback + autenticação/origem;
- schemas fechados;
- IDs/catálogos em vez de comandos livres;
- paths e `cwd` derivados/canônicos;
- `shell: false` quando aplicável;
- limites de tempo, tamanho e concorrência;
- masking antes de expor logs/respostas;
- preview, confirmação e revalidação proporcionais ao risco;
- falha parcial representada sem fabricar estado saudável;
- cleanup idempotente de processos, PTYs, streams, timers e locks.

Detalhes: [`security.md`](security.md).

## Projeto, ambiente e ownership

`Project` identifica a unidade descoberta. Quando existe paralelismo operacional, **Development Environment Instance** é a identidade comum para associar runtime, worktree e recursos pertencentes àquele contexto.

Novas features não devem criar um segundo `environmentId` ou ownership paralelo quando a Environment Instance existente resolve o problema.

Documentos relacionados:

- [`project-profile.md`](project-profile.md)
- [`project-profile-providers.md`](project-profile-providers.md)
- [`development-environment-instances.md`](development-environment-instances.md)
- [`port-registry.md`](port-registry.md)
- [`git-worktrees.md`](git-worktrees.md)
- [`docker-compose.md`](docker-compose.md)

## Execuções e estado duradouro

Process Manager, Terminal/PTYs, testes, scripts, Local CI e outros lifecycles continuam separados quando possuem contratos e ownership próprios.

Operações destacáveis podem sobreviver à navegação quando o domínio suporta reattach/follow. Buffers, históricos e stores são limitados; recurso ativo não deve ser perdido apenas por política de retenção visual.

O agregador futuro de atividade/jobs, quando existir, deve referenciar esses domínios sem assumir autoridade sobre eles.

## Git e colaboração remota

Git local permanece independente da disponibilidade de integrações remotas. O Cockpit GitHub enriquece o contexto com PR/checks/reviews usando evidência e degradação explícitas.

Readiness agrega evidências, mas não autoriza automaticamente merge, push ou deployment. A mutação responsável precisa revalidar suas próprias condições.

Documentos relacionados:

- [`github-cockpit.md`](github-cockpit.md)
- [`release-readiness.md`](release-readiness.md)
- [`test-intelligence.md`](test-intelligence.md)
- [`dependency-health.md`](dependency-health.md)
- [`migration-providers.md`](migration-providers.md)
- [`security-center.md`](security-center.md)
- [`local-ci.md`](local-ci.md)

## Produção e deployment

Deployment é um domínio próprio porque precisa de revision, plano, confirmação, provider, irreversibilidade e recovery.

Estratégias suportadas pelo contrato atual incluem:

```text
strategy=command
check → backup? → migrate? → deploy → verify

strategy=git-managed
check → migrate? → provider-deploy → verify

strategy=self-update
check → self-update
```

Providers externos recebem somente o necessário e são tratados como fontes não confiáveis/degradáveis. Credenciais permanecem no processo local e não ganham representação desnecessária em contratos públicos.

O próprio Dashboard usa o protocolo fechado de self-update com handoff/agent externo, fast-forward e prova de readiness + revision. Na instalação permanente, o restart pode ser delegado à unit fixa `dev-dashboard.service` em `systemd --user` quando ownership e checkout são comprovados.

Documentos relacionados:

- [`production-contract.md`](production-contract.md)
- [`deployment-domain.md`](deployment-domain.md)
- [`deployment-verify-retry.md`](deployment-verify-retry.md)
- [`self-production.md`](self-production.md)
- [`../deployment-operations.md`](../deployment-operations.md)
- [`../PRODUCTION.md`](../PRODUCTION.md)

## Persistência

Configuração e estado permanecem em áreas privadas do usuário, normalmente sob:

```text
~/.config/dev-dashboard
~/.local/state/dev-dashboard
```

Cada domínio persiste apenas o necessário para reconstruir ownership, histórico ou recovery. Tokens de confirmação, senhas e credenciais de provider não devem ser persistidos como estado de domínio.

## Desenvolvimento e instalação local

Desenvolvimento:

```text
npm run dev
```

Instalação permanente:

```text
npm run local:install
```

A instalação permanente usa `systemd --user`, sem serviço root/system-wide. O fluxo detalhado está em [`../local-installation.md`](../local-installation.md).

## Documentos relacionados

- [Estrutura do repositório](repository-structure.md)
- [Fluxos runtime](runtime-flows.md)
- [Segurança](security.md)
- [Visão do produto](../product/vision.md)
- [Arquitetura da informação](../design/information-architecture.md)
- [Guia de engenharia](../development-guide.md)
