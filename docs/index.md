# Dev Dashboard — documentação do projeto

O **Dev Dashboard** é uma aplicação local para organizar, inspecionar e operar projetos Rails e Node por uma interface web, mantendo o CLI Bash existente como interface complementar.

Além do desenvolvimento local, projetos que optam por um `Production Contract v1` podem expor uma superfície de **Produção** com revision, health, drift, planejamento, confirmação, timeline e recovery. Providers locais usam `strategy=command`; Vercel usa `strategy=git-managed` com uma etapa externa explícita `provider-deploy`.

Esta documentação descreve o estado vivo do produto e da engenharia. Planejamento futuro permanece em issues/PRs.

## Para quem esta documentação existe

| Público | O que encontrará aqui |
| --- | --- |
| Pessoa usuária | instalação, recursos, guias por aba e troubleshooting |
| Pessoa desenvolvedora | arquitetura, contratos, padrões e testes |
| Pessoa revisora | limites de segurança, mutações e critérios de qualidade |
| Pessoa mantenedora | operação, persistência, providers e evolução do monorepo |

## Objetivos principais

- centralizar projetos de vários workspaces;
- detectar projetos Rails e Node e suas capabilities;
- operar tarefas recorrentes com UX consistente;
- acompanhar processos e logs;
- executar mutações estruturadas com validação/confirmacão;
- manter API e desenvolvimento restritos ao computador local;
- operar produção sem shell arbitrário ou hard-code por nome de repositório;
- preservar rastreabilidade por contratos, histórico, testes e documentação.

## Capacidades principais

### Workspaces e projetos

- cadastro persistente de workspaces;
- scan de projetos Rails/Node;
- identificação de capabilities;
- discovery fail-closed de `.dev-dashboard/production.json`;
- favoritos/navegação e diagnóstico do ambiente.

### Desenvolvimento local

- servidor e processos em background;
- seleção de porta/ambiente;
- logs limitados e mascarados;
- testes e histórico;
- Rails migrations/routes, dependências e banco;
- terminal/console com salvaguardas próprias.

### Git

- status, diff, histórico e commits;
- CRUD de branches;
- sincronização, pull/push e PRs;
- mutações destrutivas sob confirmação.

### Produção

O Production Contract separa estratégia de infraestrutura.

`strategy=command`:

```text
check → backup? → migrate? → deploy → verify
```

`strategy=git-managed` + Vercel:

```text
check → backup? → migrate? → provider-deploy → verify
```

O domínio oferece:

- preview com branch/revision/etapas;
- confirmação de uso único vinculada ao `planHash`;
- working tree limpa e revalidação antes da execução;
- para Vercel, prova direta de `origin/<branch>` antes da promoção;
- envio do SHA exato confirmado à Vercel;
- polling bounded até estado terminal;
- timeline, histórico e logs no mesmo domínio;
- cancelamento com semântica conservadora;
- `recovery_required` após risco irreversível;
- retry seguro de somente `prod:verify` quando a promoção já concluiu;
- status/drift remoto separado do health funcional.

Credenciais Vercel são configuração local do processo (`VERCEL_TOKEN` e, opcionalmente, `VERCEL_TEAM_ID`) e nunca fazem parte do manifesto.

## Arquitetura em uma página

```text
┌──────────────────────────────────────────────────────────────┐
│ Interfaces                                                   │
├───────────────────────────────┬──────────────────────────────┤
│ CLI Bash                      │ Dashboard Vue 3              │
│ dev-tools / lib / init.sh     │ http://127.0.0.1:5173       │
└───────────────┬───────────────┴──────────────┬───────────────┘
                │                              │ HTTP/SSE/WS
                │                              ▼
                │                 ┌────────────────────────────┐
                │                 │ API Fastify                │
                │                 │ http://127.0.0.1:4343     │
                │                 └──────────────┬─────────────┘
                │                                │
                ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│ contracts │ core │ project-discovery │ process-manager       │
│ Git │ deployment │ testes │ banco │ Rails │ arquivos         │
└───────────────────────────────┬──────────────────────────────┘
                                │
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│ Sistema/repositórios     │          │ Providers explícitos     │
│ filesystem/Git/processos │          │ Vercel API               │
└──────────────────────────┘          └──────────────────────────┘
```

A API é a fronteira de segurança. O navegador trabalha com IDs/contratos; não recebe permissão para enviar comandos livres, paths arbitrários ou credenciais de provider.

## Princípios arquiteturais

1. **Local por padrão.** API e desenvolvimento escutam em `127.0.0.1`.
2. **Catálogo fechado.** Ações estruturadas são resolvidas pelo backend.
3. **Sem shell arbitrário.** Programa e argumentos são separados sempre que possível.
4. **IDs em vez de paths.** Operações usam identificadores controlados.
5. **Contratos compartilhados.** Frontend/backend reutilizam `packages/contracts`.
6. **Persistência mínima.** Configuração/estado ficam fora do repo e com permissões restritas.
7. **Confirmação forte.** Mutações sensíveis são vinculadas a contexto/target.
8. **Revision é evidência.** Produção exige prova do código confirmado; git-managed adiciona prova do `origin` real antes da promoção.
9. **Provider não é health.** `READY` da Vercel não substitui `prod:verify`.
10. **Recovery conservador.** Não há rollback cego após etapa irreversível.
11. **Documentação junto do código.** Mudança de comportamento atualiza docs na mesma entrega.

## Desenvolvimento

```bash
npm install
npm run dev
```

| Serviço | Endereço | Responsabilidade |
| --- | --- | --- |
| API | `http://127.0.0.1:4343` | regras, persistência, processos e integrações |
| Web | `http://127.0.0.1:5173` | interface Vue |

Para integração Vercel local, use `.env.local` na raiz:

```dotenv
VERCEL_TOKEN=...
# opcional:
VERCEL_TEAM_ID=team_...
```

O token não deve ser versionado.

## Mapa da documentação

### Comece por aqui

- [Primeiros passos](getting-started.md)
- [Visão geral da arquitetura](architecture/overview.md)
- [Estrutura do repositório](architecture/repository-structure.md)
- [Fluxos de execução](architecture/runtime-flows.md)
- [Segurança](architecture/security.md)

### Produção

- [Production Contract v1](architecture/production-contract.md): manifesto, estratégias e validação.
- [Domínio de deployment](architecture/deployment-domain.md): planner, confirmação, execução, Vercel e recovery.
- [Retry de verify](architecture/deployment-verify-retry.md): caso seguro de repetição somente da verificação.
- [Self-production](architecture/self-production.md): por que o próprio dashboard continua bloqueado para self-update.
- [Operação de deployments](deployment-operations.md): procedimento e troubleshooting.
- [Interface de Produção](production-ui.md): estados/UX da superfície web.
- [Guia da aba Produção](guia/producao.md): passo a passo para uso diário.

### Dashboard web por aba

- [Guia geral](guia/README.md)
- [README](guia/readme.md)
- [Diagnóstico](guia/diagnostico.md)
- [Servidor](guia/servidor.md)
- [Logs](guia/logs.md)
- [Git](guia/git.md)
- [Testes](guia/testes.md)
- [Banco de dados](guia/banco-de-dados.md)
- [Dependências](guia/dependencias.md)
- [Produção](guia/producao.md)
- [Terminal/Console](guia/terminal.md)
- [Variáveis de ambiente](guia/variaveis-de-ambiente.md)
- [Workspaces](guia/workspaces.md)

### Engenharia e operação

- [Guia de desenvolvimento](development-guide.md)
- [Contribuindo](../CONTRIBUTING.md)
- [Playbook de CI](ci-fix-playbook.md)
- [Operação e troubleshooting geral](operations-and-troubleshooting.md)
- [Referência da API](architecture/api-reference.md) — gerada a partir dos schemas Fastify.

## Planejamento

Roadmaps, débitos e acompanhamento multi-PR vivem nas issues e PRs do GitHub. `docs/` descreve comportamento implementado e procedimentos permanentes; não recrie `tasks/`, `NEXT.md` ou arquivos de backlog equivalentes.

## Glossário

| Termo | Significado |
| --- | --- |
| Workspace | diretório cadastrado que contém projetos |
| Projeto | aplicação Rails/Node conhecida pelo `ProjectStore` |
| Capability | recurso detectado, como Git, tests, database ou production |
| Production Contract | manifesto v1 de estratégia/provider/scripts/políticas |
| DeploymentPlan | preview imutável de projeto, revision e etapas |
| `provider-deploy` | etapa externa tipada de promoção Vercel |
| Deployment | execução confirmada com timeline/histórico/recovery |
| Drift | comparação entre revisions conhecidas de origin e produção |
| `recovery_required` | estado que exige investigação após risco irreversível |
| Confirmação | token temporário vinculado a uma mutação específica |
| Snapshot | cópia controlada de banco |
| SSE | canal de eventos servidor → navegador |

## Critério de documentação completa

Uma funcionalidade está documentada quando é possível responder:

- o que é e por que existe;
- onde está implementada;
- quais entradas/saídas aceita;
- que comando/provider pode acionar;
- que estado persiste;
- quais riscos e limites possui;
- como é testada;
- como diagnosticar falhas;
- como alterá-la sem quebrar contratos existentes.
