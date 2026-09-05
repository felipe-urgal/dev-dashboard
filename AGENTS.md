# AGENTS.md

Guia canônico para qualquer agente de IA que trabalhe neste repositório (Codex, Claude Code, Cursor, Copilot ou equivalente).

Este arquivo existe para reduzir decisões ambíguas antes de editar código. Ele resume as regras inegociáveis, indica a camada correta para cada tipo de mudança, define os invariantes arquiteturais e aponta para a documentação especializada quando o assunto exigir mais contexto.

## Como usar este guia

Antes de editar:

1. leia este `AGENTS.md`;
2. leia [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md);
3. leia [`docs/architecture/overview.md`](docs/architecture/overview.md);
4. leia a documentação específica do domínio que será alterado;
5. confirme o comportamento atual no código e nos testes antes de reaproveitar uma ideia, débito ou plano antigo.

Não é necessário ler toda a documentação em toda mudança. Use o mapa de documentos ao final deste arquivo para aprofundar somente o domínio relevante.

Quando código e documentação divergirem, não escolha silenciosamente o lado mais conveniente: confirme o comportamento real, preserve os invariantes atuais e atualize a documentação que ficou obsoleta na mesma entrega.

## O projeto em uma frase

O Dev Dashboard mantém **duas interfaces válidas e independentes** para operações de desenvolvimento: um CLI Bash em `lib/` carregado por `init.sh` e uma aplicação web Vue 3 que conversa com uma API Fastify local. O repositório também possui um domínio próprio de Produção baseado em `Production Contract v1`, incluindo deployment, providers e self-update.

## Modelo mental do repositório

```text
CLI Bash
lib/ + init.sh
    │
    └── interface independente

Dashboard Vue 3
apps/web
    │
    ▼
API Fastify local
apps/api
    │
    ├── services / stores / security / routes
    ├── deployment
    └── integrações locais/externas
    │
    ▼
packages/
contracts | core | project-discovery | process-manager

Produção
Production Contract -> planner -> confirmação -> execução -> timeline/recovery
                                          ├── strategy=command
                                          ├── strategy=git-managed
                                          └── strategy=self-update
```

O CLI Bash não é uma implementação temporária da web, e a web não é uma reescrita obrigatória do CLI. Não sincronize os dois por reflexo.

## Regras inegociáveis

1. **Português brasileiro**: UI, documentação, comentários relevantes, mensagens de commit e descrições de PR são escritos em português brasileiro quando controlados por este projeto.
2. **Simplicidade primeiro**: prefira a menor solução que preserve os invariantes existentes. Não adicione abstrações, stores, services, componentes-base, packages ou etapas de UI “para o futuro”.
3. **Documentação acompanha comportamento**: mudança de comportamento, rota, capacidade, configuração, fluxo ou risco atualiza a documentação viva correspondente na mesma entrega.
4. **Backlog não vive no repositório**: não recrie `tasks/`, `NEXT.md`, `PENDENCIAS.md`, roadmaps versionados ou equivalentes. Trabalho futuro/multi-PR vive em issues do GitHub.
5. **A API é uma fronteira de segurança**: não introduza shell arbitrário, paths livres, credenciais vindas do browser ou bypass de autenticação/origem.
6. **CLI Bash e web são independentes**: só compartilhe implementação entre eles quando houver decisão arquitetural explícita e segura.
7. **UI interativa do CLI possui dois caminhos**: mantenha `gum` e o fallback puro com `read -r -p`/menu numerado.
8. **Estado visual precisa ser verdadeiro**: loading, progresso, erro, sucesso, bloqueios e indicadores de atividade representam trabalho real, não expectativa visual.
9. **Recursos duradouros precisam de ownership e cleanup**: processos, PTYs, streams, timers, subscriptions, listeners e locks devem ter lifecycle explícito.
10. **Mutações sensíveis precisam de autoridade proporcional ao risco**: preview, confirmação, revalidação e recovery são preservados quando o domínio exigir.
11. **Git de escrita exige autorização**: não faça push, merge, exclusão de branch ou outra mutação remota sem instrução direta do usuário ou autorização contínua previamente válida para aquele fluxo.
12. **Merge exige autorização explícita do usuário**: mesmo com PR pronto e CI verde, não faça merge sem essa autorização.

## Princípio de implementação

Aplique KISS, DRY e YAGNI de forma pragmática.

Prefira implementar na menor camada correta e extrair uma abstração somente quando existir pelo menos uma razão concreta:

- responsabilidade independente;
- repetição real de comportamento/semântica;
- fronteira de segurança ou autoridade;
- necessidade clara de isolamento para teste;
- lifecycle próprio;
- contrato compartilhado entre camadas.

Não crie interfaces, adapters, services ou componentes-base apenas para satisfazer um padrão abstrato. Composition roots podem depender de implementações concretas; o importante é manter domínio, transporte, apresentação e infraestrutura em responsabilidades claras.

Evite refactors sem relação com o objetivo da entrega. Se um problema adjacente for relevante mas ampliar o escopo, registre-o em issue em vez de transformar um PR simples em reestruturação ampla.

## Layout e responsabilidade das camadas

| Área | Responsabilidade principal | Não deve virar |
| --- | --- | --- |
| `apps/api` | API, casos de uso, integrações, persistência de estado da aplicação, segurança e deployment | coleção de regras de UI |
| `apps/web` | apresentação, navegação, estado visual e consumo de contratos HTTP | executor de filesystem/processos/shell |
| `packages/contracts` | tipos/contratos TypeScript puros compartilhados | package de infraestrutura |
| `packages/core` | configuração de workspaces, IDs e token local | dependência de Vue/Fastify |
| `packages/project-discovery` | detecção Rails/Node e capabilities | lógica de UI ou deployment |
| `packages/process-manager` | lifecycle de processos de desenvolvimento conhecidos | executor genérico de qualquer processo |
| `lib/` | CLI Bash original | camada obrigatoriamente acoplada à web |
| `scripts/` | tooling do próprio repositório | comportamento público da UI |
| `docs/` | estado vivo do produto e da engenharia | backlog/roadmap |

## Onde implementar cada mudança

| Necessidade | Camada esperada |
| --- | --- |
| tipo compartilhado entre API e web | `packages/contracts` |
| regra reutilizável realmente independente dos apps | package compartilhado apropriado |
| caso de uso/integração específica do backend | service em `apps/api` |
| transporte HTTP | route Fastify em `apps/api/src/routes` |
| schema/erro HTTP compartilhado no backend | `apps/api/src/http` |
| integração com provider externo | adapter explícito no domínio correspondente |
| apresentação/estado visual | Vue em `apps/web` |
| chamada HTTP da web | `apps/web/src/api.ts` e/ou `apps/web/src/api/` |
| estado vivo compartilhado entre views | store/composable/registry de frontend, não timer duplicado em componente |
| processo de desenvolvimento conhecido | `packages/process-manager` |
| execução estruturada de scripts | lifecycle próprio em `apps/api/src/services/script-execution/` |
| deployment de produção | domínio `apps/api/src/deployment/` |
| self-update do próprio Dashboard | domínio de deployment + cadeia de self-update existente |
| comando/fluxo do CLI Bash | `lib/` + carregamento pelo `init.sh` |
| tooling de CI/release/dev do próprio repo | `scripts/` / `.github/` |
| comportamento implementado | `docs/` |
| trabalho futuro, débito ou plano multi-PR | GitHub Issue |

Se a mudança não encaixar claramente nessa tabela, leia `docs/development-guide.md` e `docs/architecture/overview.md` antes de criar uma nova camada.

## Backend e API (`apps/api`)

### Rotas e contratos

- Fastify + JSON Schema são a interface HTTP.
- Declare `params`, `querystring`, `body` e `response` explicitamente quando aplicável.
- Use schemas fechados e `additionalProperties: false` quando o contrato exigir shape fechado.
- Schemas de resposta compartilhados ficam em `apps/api/src/http/response-schemas.ts` e descartam campos não declarados na serialização.
- Erros públicos passam por `ApiError`/`ApiErrorCode`; erro novo exige código público estável quando o cliente precisa distingui-lo.
- `docs/architecture/api-reference.md` é gerada. Não edite manualmente.

Quando rota/schema mudar:

```bash
npm run docs:api
npm run docs:api:check
```

### Composição e serviços

`app.ts` preserva a fronteira HTTP, segurança e registro das rotas. Construção de serviços, stores e recursos de lifecycle deve permanecer nas camadas de composição/contexto existentes em vez de transformar `app.ts` em composition root monolítico.

Serviço que mantém recurso duradouro deve possuir fechamento/cleanup explícito e participar do lifecycle adequado do Fastify quando necessário.

### Segurança

Leia `docs/architecture/security.md` antes de criar ou alterar rotas, comandos, arquivos, processos, autenticação, providers ou mutações relevantes.

Invariantes:

- API escuta em loopback;
- `GET /api/health` é a única rota HTTP pública;
- browser envia IDs/payloads estruturados, não linha de shell final;
- programa, argumentos e `cwd` são derivados/validados pelo backend;
- use `shell: false` quando aplicável;
- paths são resolvidos canonicamente a partir de projetos/workspaces conhecidos;
- path absoluto vindo do browser não concede autoridade;
- symlinks/escopo são revalidados em operações mutáveis quando necessário;
- arquivos/logs/respostas externas possuem limites;
- credenciais e secrets não entram em logs, URLs, contratos públicos ou persistência sem necessidade explícita;
- providers externos são input não confiável: valide shape, tamanho, timeout e sanitize erros;
- mutações sensíveis preservam preview/confirmação/revalidação;
- TOCTOU deve ser tratado quando estado pode mudar entre preview e execução.

Não crie exceção local de segurança para “facilitar” uma feature. Se o modelo atual não comporta a mudança, trate isso como decisão arquitetural e atualize a documentação de segurança.

## Frontend (`apps/web`)

### Responsabilidade

O frontend apresenta estado e envia intenções estruturadas à API. Ele não acessa filesystem, não executa comandos locais, não determina `cwd` de autoridade e não conversa diretamente com providers privilegiados.

### Política de UI

O produto prioriza **simples, ágil e funcional**.

Antes de adicionar um elemento, pergunte se algo existente pode ser removido, reposicionado ou simplificado.

Prefira:

- ação no contexto onde é usada;
- hierarquia curta;
- linguagem direta;
- uma fonte de verdade visual;
- componentes compactos quando o conteúdo permitir;
- confirmação proporcional ao risco;
- estado real em vez de decoração de atividade.

Evite:

- títulos, subtítulos, cards ou resumos redundantes;
- filtros/buscas quando a quantidade de itens não exige;
- botões duplicados para a mesma ação;
- telas intermediárias sem decisão real;
- animação de loading quando não existe trabalho em andamento;
- abstração visual antes de repetição real de estrutura/semântica.

### Estado assíncrono

- Requests canceláveis usam `AbortController` quando o cancelamento é real e suportado pelo fluxo.
- Abortar `fetch` não prova que uma mutação remota já iniciada foi cancelada.
- Operações não canceláveis descartam respostas obsoletas por `generation`/latest-wins.
- Depois de troca de projeto, workspace, rota ou contexto, respostas antigas não podem sobrescrever o estado atual.
- Ações concorrentes são bloqueadas somente quando existe risco real de corrida ou duplicação de efeito.
- Abort esperado não deve aparecer como erro de produto.

Para estado vivo, siga `docs/architecture/frontend-live-state.md`:

1. snapshot quando leitura pontual basta;
2. SSE/WS quando o backend já oferece eventos adequados;
3. polling somente como fallback explícito, com consumidores ativos e lifecycle de parada.

Não crie polling duplicado em cada componente que observa o mesmo recurso.

### Acessibilidade e comportamento

Toda interação relevante deve considerar:

- loading/vazio/erro/sucesso;
- teclado e ordem de foco;
- retorno de foco em dialogs;
- semântica acessível;
- responsividade;
- `prefers-reduced-motion`;
- live regions quando feedback assíncrono precisar ser anunciado.

Prefira estado/componentes/composables Vue. Não use `MutationObserver`, enhancer global ou pós-processamento imperativo de DOM para corrigir uma feature que pode ser representada declarativamente.

## Concorrência, recursos e lifecycle

Qualquer recurso duradouro precisa responder claramente:

- quem cria;
- quem é o owner;
- quando termina;
- como é cancelado/fechado;
- o que acontece em erro/shutdown;
- como respostas/eventos atrasados são descartados.

Isso vale para:

- processos filhos;
- PTYs;
- streams SSE/WS;
- timers/polling;
- subscriptions/listeners;
- locks;
- handles de arquivo;
- sessões temporárias;
- operações externas longas.

Não corrija uma corrida apenas escondendo o efeito na UI. Proteja a fonte de estado/lifecycle correta.

Cleanup precisa ser idempotente quando a mesma finalização puder ocorrer por caminhos diferentes.

## Packages compartilhados

### `packages/contracts`

É intencionalmente puro.

- mantenha tipos/contratos compartilhados;
- não adicione Fastify, Vue ou dependência de infraestrutura sem necessidade arquitetural excepcional;
- não coloque lógica específica de um app quando um tipo basta.

### `packages/core`

Centraliza configuração/IDs/token local compartilháveis sem depender das aplicações.

### `packages/project-discovery`

Detecta projetos/capabilities e valida contratos de descoberta. Preserve limites de scan, tratamento de symlink, warnings e comportamento fail-closed.

### `packages/process-manager`

Gerencia processos de desenvolvimento conhecidos, atualmente `server`, `test`, `worker` e `webpack`.

Preserve:

- comando reconhecido;
- `cwd` validado;
- `shell: false`;
- identidade do processo;
- logs limitados;
- persistência coerente;
- TERM antes de KILL;
- cleanup e prova de ownership.

Deployment e self-update **não** são kinds de `process-manager`.

## Domínios que não devem ser misturados

```text
Process Manager != Script Execution != Deployment != Self Update
```

### Process Manager

Lifecycle de processos conhecidos de desenvolvimento.

### Script Execution

Execuções estruturadas de scripts com lifecycle próprio em `apps/api/src/services/script-execution/`.

### Deployment

Domínio com revision, plano, confirmação, timeline, provider, irreversibilidade e recovery.

### Self Update

Estratégia de deployment do próprio Dev Dashboard que precisa sobreviver ao encerramento da API antiga por handoff/agent externo.

Semelhança de implementação não autoriza reutilizar uma abstração que dilua essas fronteiras.

## Produção e deployment

Antes de alterar Production Contract, planner, adapters, providers, recovery ou UI de Produção, leia:

- `docs/PRODUCTION.md` quando tocar a produção do próprio Dashboard;
- `docs/architecture/production-contract.md`;
- `docs/architecture/deployment-domain.md`;
- `docs/architecture/security.md`;
- `docs/deployment-operations.md`;
- `docs/production-ui.md`.

Invariantes comuns:

1. working tree/revision/branch são revalidadas;
2. plano contém contexto suficiente para ser revisado antes da mutação;
3. confirmação é vinculada ao `planHash` e ao alvo correto;
4. browser não fornece shell/programa/args/credencial de provider;
5. etapas irreversíveis podem exigir `recovery_required` em vez de rollback cego;
6. retry de verify não repete mutação anterior;
7. provider `READY` não substitui health funcional do projeto;
8. logs e erros externos são bounded/sanitizados;
9. credenciais não entram no Production Contract, responses ou persistência operacional.

### `strategy=command`

Somente aliases `prod:*` canônicos reconhecidos pelo contrato podem virar etapas estruturadas.

### `strategy=git-managed`

Não invente `prod:deploy` local. Providers como Vercel usam etapa própria e recebem revision/branch/origem derivadas pelo backend. A revision remota precisa provar o SHA confirmado antes da promoção.

### `strategy=self-update`

O próprio Dev Dashboard usa:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

Não existe `npm run prod:deploy` local para esse fluxo.

Comandos de diagnóstico:

```bash
npm run prod:status
npm run prod:check
```

`npm run check` valida código/CI. `npm run prod:check` valida o contrato/agent instalado na máquina. Um não substitui o outro.

Os scripts `self-update:*` são tooling de engenharia e **não** são bypass do Production Contract, planner, confirmação, handoff, fast-forward da revision confirmada, restart e prova de readiness/revision.

## CLI Bash (`lib/` + `init.sh`)

### Convenções

- comandos públicos: kebab-case, normalmente `dev-*`, `git-*`, `project-*`;
- helpers privados: `_` + snake_case;
- comandos públicos necessários em subshells são exportados deliberadamente;
- módulos seguem a convenção existente `init.sh` + `helpers.sh` + arquivos de ação (`run.sh`, `start.sh`, `stop.sh`, `logs.sh`, `menu.sh`, etc.);
- módulos opcionais carregados com `required=false` avisam, não abortam.

Não invente uma convenção nova de carregamento sem necessidade arquitetural.

### UI dupla

Função interativa precisa funcionar:

- com `gum`;
- sem `gum`, usando fallback Bash puro.

A ausência de `gum` não deve inutilizar o comando.

### Estado e reload

`init.sh` evita carregamento duplicado usando `DEV_LOADED`. Em testes que precisam executar múltiplos `source`, use shell novo ou remova a variável de forma controlada antes de recarregar.

### Processos

Preserve o fluxo existente de PID/log/porta/identidade e encerramento TERM antes de KILL. Não duplique lifecycle de processos Rails/Node fora do núcleo existente sem necessidade.

### Validação

Ao tocar `lib/` ou `init.sh`:

```bash
npm run test:cli
```

Mudança interativa também deve ser validada nos dois caminhos de UI quando aplicável.

`lib/*/tests/` contém menus para executar testes do projeto alvo; não é a suíte do Dev Dashboard.

## Testes e qualidade

### Gate canônico

Para uma mudança normal:

```bash
npm run check
```

Esse gate executa:

```text
lint
-> test
-> build:apps
```

`npm test` preserva `pretest`, portanto compila os packages compartilhados antes das suítes. Os apps importam `dist/` dos packages, não o TypeScript fonte diretamente.

Coverage é diagnóstico, não meta percentual:

```bash
npm run test:coverage
```

### Matriz de validação por risco

| Mudança | Validação adicional esperada |
| --- | --- |
| qualquer mudança normal | `npm run check` |
| `lib/` / `init.sh` | `npm run test:cli` + validação manual de UI dupla quando interativa |
| rota/schema HTTP | `npm run docs:api && npm run docs:api:check` + testes de rota/contrato |
| contratos/tipos/packages | `npm run typecheck` quando houver risco de compatibilidade entre workspaces |
| UI/jornada crítica | `npm run test:e2e` quando unidade/componente não prova a integração real |
| mudança extensa formatável | `npm run format:check` |
| runtime/dependência de plataforma | validar Node mínimo quando houver risco de incompatibilidade |
| segurança/path/processo/provider | testes de falha/limites/cleanup + revisar documentação de segurança |
| deployment/recovery | testes de sucesso, falha, revalidação e efeito parcial relevantes |
| self-production | `npm run prod:check` quando o ambiente possuir o agent instalado; registrar quando não for aplicável |
| investigação de cobertura | `npm run test:coverage` sob demanda |

Checks direcionados complementam `npm run check`; não o substituem.

### O que vale testar

Priorize testes que protegem:

- regra de negócio;
- contratos públicos;
- segurança/autorização;
- mutações destrutivas;
- confirmação/revalidação;
- concorrência/cleanup;
- recovery;
- regressões observadas;
- estados relevantes de UI.

Prefira o nível mais barato que prove a regra: função pura antes de integração, integração antes de E2E, salvo quando a fronteira real é o comportamento que precisa ser protegido.

Não escreva testes apenas para elevar coverage ou congelar CSS, markup, ordem incidental ou detalhes internos sem valor de regressão.

Fixtures que criam repositórios, processos, arquivos, sockets ou providers simulados precisam de isolamento e cleanup garantido.

## Documentação

`docs/` descreve o **estado implementado atual**. História específica de uma entrega fica no PR; trabalho futuro fica em issue.

### Onde documentar

| Alteração | Documento principal |
| --- | --- |
| setup/fluxo de desenvolvimento | `docs/DEVELOPMENT.md` |
| produção do próprio Dashboard | `docs/PRODUCTION.md` |
| arquitetura/camada | `docs/architecture/*` |
| segurança | `docs/architecture/security.md` |
| fluxo runtime/lifecycle | `docs/architecture/runtime-flows.md` |
| estado vivo do frontend | `docs/architecture/frontend-live-state.md` |
| variável/porta/persistência/troubleshooting | `docs/operations-and-troubleshooting.md` |
| Production Contract | `docs/architecture/production-contract.md` |
| planner/adapter/recovery | `docs/architecture/deployment-domain.md` |
| operação de deployment | `docs/deployment-operations.md` |
| UI de Produção | `docs/production-ui.md` e `docs/guia/producao.md` |
| endpoint/schema HTTP | `docs/architecture/api-reference.md` gerada |
| processo de engenharia | `AGENTS.md`, `CONTRIBUTING.md`, `docs/development-guide.md`, `docs/testing-and-quality.md` |
| uso por funcionalidade | `docs/guia/*` |
| backlog/roadmap/débito multi-PR | GitHub Issues/PRs |

Quando endpoint/schema mudar, regenere a referência; não edite o arquivo gerado manualmente.

## Git, branches, commits e PRs

### Branches

Prefixos adotados pelo projeto:

| Prefixo | Uso |
| --- | --- |
| `feature/` | nova funcionalidade |
| `bugfix/` | correção comum |
| `hotfix/` | correção urgente |
| `docs/` | documentação |
| `refactor/` | alteração interna sem mudança de comportamento |
| `test/` | testes |

Mantenha branches curtas e focadas quando possível.

### Commits

Use mensagens curtas, objetivas e em português quando possível, por exemplo:

```text
feat: adiciona navegação por projeto
fix: descarta resposta obsoleta após trocar workspace
docs: atualiza contrato de self-production
test: cobre cleanup após falha de processo
```

Separe mudanças sem relação quando isso melhorar revisão.

### Pull request

Um PR deve registrar, quando aplicável:

- problema/objetivo;
- o que mudou;
- impacto para usuário/desenvolvimento;
- decisões e guardrails;
- riscos;
- persistência/configuração nova;
- testes/gates executados;
- documentação atualizada;
- issue relacionada;
- impacto visual.

Faça auto code review no **head definitivo**. Se corrigir algo depois do review, reavalie os trechos impactados e repita os gates necessários.

### Merge

- não faça merge sem autorização explícita do usuário;
- autorização para abrir PR não é autorização para merge;
- mesmo autorizado, aguarde checks exigidos verdes e resolva pendências conhecidas;
- depois do merge, confirme o estado da `main` e informe comandos locais necessários para atualizar/reiniciar o ambiente quando aplicável.

## Operações que exigem cuidado especial

Antes de executar ou implementar operações destrutivas/sensíveis, confirme a fronteira de autoridade:

- exclusão/força em Git;
- descarte de working tree;
- restore de banco/snapshot;
- execução com privilégio;
- deployment/promoção externa;
- alteração de secrets/configuração privada;
- self-update;
- encerramento de processos que não tenham ownership comprovado.

Não transforme confirmação de UI em autorização genérica reutilizável para outro alvo/contexto.

## Anti-patterns do projeto

Evite explicitamente:

- recriar `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado;
- deixar auditoria/débito multi-PR apenas em conversa sem issue;
- usar `docs/` como planejamento futuro;
- criar abstração “para talvez usar depois”;
- introduzir infraestrutura em `packages/contracts`;
- aceitar shell/comando livre do browser;
- aceitar path absoluto do browser como autoridade de filesystem/processo;
- executar provider externo diretamente do frontend;
- misturar Process Manager, Script Execution, Deployment e Self Update;
- adicionar polling/timer duplicado em componentes;
- permitir resposta async antiga sobrescrever contexto novo;
- tratar abort de request como prova de cancelamento remoto;
- usar `MutationObserver`/enhancer global para contornar estado Vue;
- mostrar loading/animação quando não existe trabalho real;
- editar `docs/architecture/api-reference.md` manualmente;
- transformar `self-update:*` em bypass do Production Contract;
- fazer rollback cego depois de efeito irreversível;
- adicionar teste de baixo valor apenas por coverage;
- realizar Git de escrita ou merge sem autorização adequada.

## Fluxo recomendado de uma entrega

```text
contexto do usuário / issue
        ↓
confirmar comportamento atual
        ↓
ler docs do domínio
        ↓
escolher menor camada correta
        ↓
implementar
        ↓
testes relevantes
        ↓
validação manual quando aplicável
        ↓
npm run check
        ↓
checks direcionados pelo risco
        ↓
atualizar documentação viva
        ↓
auto code review do head final
        ↓
PR pequeno e revisável
        ↓
CI verde + pendências resolvidas
        ↓
merge somente com autorização explícita
```

## Definição de pronto

Antes de declarar uma entrega pronta, confirme:

- [ ] resolve o problema declarado sem ampliar escopo desnecessariamente;
- [ ] a responsabilidade ficou na camada correta;
- [ ] não introduziu shell arbitrário, path de autoridade indevido ou vazamento de credencial;
- [ ] mutações preservam confirmação/revalidação/recovery quando necessário;
- [ ] recursos duradouros possuem cleanup/lifecycle correto;
- [ ] respostas assíncronas obsoletas não alteram o contexto atual;
- [ ] UI representa loading/erro/sucesso/progresso de forma honesta;
- [ ] testes protegem riscos reais e regressões relevantes;
- [ ] documentação viva foi atualizada;
- [ ] `npm run check` passou no head final;
- [ ] checks direcionados aplicáveis passaram ou a impossibilidade foi registrada;
- [ ] o diff final passou por auto-review;
- [ ] o PR explica decisões, riscos e validação;
- [ ] nenhum merge foi feito sem autorização explícita.

## Mapa de leitura por domínio

| Se a mudança toca... | Leia antes |
| --- | --- |
| qualquer desenvolvimento | `docs/DEVELOPMENT.md`, `docs/architecture/overview.md` |
| regras de engenharia | `docs/development-guide.md`, `CONTRIBUTING.md` |
| testes/CI | `docs/testing-and-quality.md` |
| API/segurança | `docs/architecture/security.md` |
| runtime/processos | `docs/architecture/runtime-flows.md` |
| estado realtime/polling web | `docs/architecture/frontend-live-state.md` |
| configuração/persistência/diagnóstico | `docs/operations-and-troubleshooting.md` |
| Production Contract | `docs/architecture/production-contract.md` |
| deployment/provider/recovery | `docs/architecture/deployment-domain.md`, `docs/deployment-operations.md` |
| UI de Produção | `docs/production-ui.md`, `docs/guia/producao.md` |
| self-production | `docs/PRODUCTION.md`, `docs/architecture/self-production.md` |
| uso da interface | `docs/guia/README.md` + guia específico |

## Regra final

Antes de entregar código ou plano, faça uma última pergunta prática:

> Esta solução é a menor implementação correta que preserva segurança, ownership, contratos, estado real e simplicidade do produto?

Se não for, simplifique ou mova a responsabilidade para a camada correta antes de finalizar.