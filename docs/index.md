# Dev Dashboard — documentação do projeto

O **Dev Dashboard** é uma aplicação local para organizar, inspecionar e operar projetos Rails e Node por uma interface web, mantendo o CLI Bash como interface complementar.

Projetos que optam por um `Production Contract v1` podem expor uma superfície de **Produção** com revision, health, drift, planejamento, confirmação, timeline e recovery. Providers locais usam `strategy=command`; Vercel usa `strategy=git-managed`; o próprio Dashboard usa `strategy=self-update` habilitado e fechado.

Esta documentação descreve o estado vivo do produto e da engenharia. Planejamento futuro permanece em issues/PRs.

## Entradas canônicas

- [`DEVELOPMENT.md`](DEVELOPMENT.md): setup, execução local, gate de PR e checks direcionados;
- [`PRODUCTION.md`](PRODUCTION.md): produção do próprio Dev Dashboard via self-update;
- [`../README.md`](../README.md): visão geral e quickstart;
- [`guia/README.md`](guia/README.md): uso por funcionalidade.

## Para quem esta documentação existe

| Público | O que encontrará aqui |
| --- | --- |
| Pessoa usuária | instalação, recursos, guias por aba e troubleshooting |
| Pessoa desenvolvedora | arquitetura, contratos, padrões e testes |
| Pessoa revisora | limites de segurança, mutações e critérios de qualidade |
| Pessoa mantenedora | operação, persistência, providers e evolução do monorepo |

## Capacidades principais

### Workspaces e projetos

- cadastro persistente de workspaces;
- scan de projetos Rails/Node;
- capabilities detectadas;
- discovery fail-closed de `.dev-dashboard/production.json`;
- favoritos/navegação e diagnóstico do ambiente.

### Desenvolvimento local

- processos em background;
- seleção de porta/ambiente;
- logs limitados/mascarados;
- testes e histórico;
- Rails migrations/routes, dependências e banco;
- terminal/console com salvaguardas próprias.

### Git

- status, diff, histórico e commits;
- CRUD de branches;
- sincronização, pull/push e PRs;
- mutações destrutivas sob confirmação.

### Produção

`strategy=command`:

```text
check -> backup? -> migrate? -> deploy -> verify
```

`strategy=git-managed` + Vercel:

```text
check -> backup? -> migrate? -> provider-deploy -> verify
```

`strategy=self-update` do próprio Dashboard:

```text
check -> self-update
```

O domínio oferece preview, confirmação vinculada ao `planHash`, revalidação da revision, timeline, logs, estados terminais e recovery conservador.

Credenciais de providers são configuração local do processo e nunca fazem parte do manifesto.

## Arquitetura em uma página

```text
CLI Bash                        Dashboard Vue 3
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

A API é a fronteira de segurança. O navegador trabalha com IDs/contratos; não recebe permissão para enviar comandos livres, paths arbitrários ou credenciais de provider.

## Princípios arquiteturais

1. **Local por padrão.** API e desenvolvimento escutam em loopback.
2. **Catálogo fechado.** Ações estruturadas são resolvidas pelo backend.
3. **Sem shell arbitrário.** Programa e argumentos são separados quando possível.
4. **IDs em vez de paths.** Operações usam identificadores controlados.
5. **Contratos compartilhados.** Frontend/backend reutilizam `packages/contracts`.
6. **Persistência mínima.** Configuração/estado ficam fora do repo e com permissões restritas.
7. **Confirmação forte.** Mutações sensíveis são vinculadas a contexto/target.
8. **Revision é evidência.** Produção exige prova do código confirmado.
9. **Provider não é health.** READY externo não substitui verificação funcional.
10. **Recovery conservador.** Não há rollback cego após etapa irreversível.
11. **Documentação junto do código.** Mudança de comportamento atualiza docs na mesma entrega.

## Desenvolvimento rápido

```bash
npm ci
npm run doctor
npm run dev
```

| Serviço | Endereço |
| --- | --- |
| API | `http://127.0.0.1:4343` |
| Web | `http://127.0.0.1:5174` |

Gate antes do PR:

```bash
npm run check
```

Detalhes em [`DEVELOPMENT.md`](DEVELOPMENT.md) e [`testing-and-quality.md`](testing-and-quality.md).

## Mapa da documentação

### Comece por aqui

- [Desenvolvimento](DEVELOPMENT.md)
- [Produção do próprio Dashboard](PRODUCTION.md)
- [Primeiros passos](getting-started.md)
- [Visão geral da arquitetura](architecture/overview.md)
- [Segurança](architecture/security.md)

### Produção

- [Production Contract v1](architecture/production-contract.md)
- [Domínio de deployment](architecture/deployment-domain.md)
- [Retry de verify](architecture/deployment-verify-retry.md)
- [Self-production](architecture/self-production.md)
- [Operação de deployments](deployment-operations.md)
- [Interface de Produção](production-ui.md)
- [Guia da aba Produção](guia/producao.md)

### Dashboard web por aba

- [Guia geral](guia/README.md)
- [Command Palette](product/command-palette.md)
- [README](guia/readme.md)
- [Diagnóstico](guia/diagnostico.md)
- [Servidor](guia/servidor.md)
- [Logs](guia/logs.md)
- [Git](guia/git.md)
- [Testes](guia/testes.md)
- [Banco](guia/banco-de-dados.md)
- [Dependências](guia/dependencias.md)
- [Produção](guia/producao.md)
- [Terminal/Console](guia/terminal.md)
- [Variáveis](guia/variaveis-de-ambiente.md)
- [Workspaces](guia/workspaces.md)

### Engenharia e operação

- [Guia de engenharia](development-guide.md)
- [Testes e qualidade](testing-and-quality.md)
- [Contribuindo](../CONTRIBUTING.md)
- [Playbook de CI](ci-fix-playbook.md)
- [Operação e troubleshooting](operations-and-troubleshooting.md)
- [Referência da API](architecture/api-reference.md)

## Planejamento

Roadmaps, débitos e acompanhamento multi-PR vivem nas issues e PRs do GitHub. `docs/` descreve comportamento implementado e procedimentos permanentes; não recrie `tasks/`, `NEXT.md` ou arquivos equivalentes.

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
