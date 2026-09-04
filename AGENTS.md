# AGENTS.md

Guia rápido para agentes de IA (Claude Code, Cursor, Copilot, etc.) que forem trabalhar neste repositório. Complementa o `CLAUDE.md` — leia ambos antes de editar qualquer arquivo.

## O que é este projeto em uma frase

Um repositório com **duas interfaces** para o mesmo domínio: um CLI bash em `lib/` (carregado no shell do usuário via `init.sh`) e um dashboard web TypeScript em `apps/` + `packages/`. Nenhum dos dois substitui o outro; o web reaproveita conceitos por trás de uma API HTTP local.

## Regras de ouro

1. **Idioma**: todo texto criado ou editado (UI, comentários, mensagens de commit, documentação, PRs) é em **português brasileiro**.
2. **Planejamento em issues, não em arquivos de backlog**: a pasta `tasks/` foi removida deliberadamente e não deve ser recriada. `NEXT.md`, `PENDENCIAS.md`, roadmaps versionados e arquivos equivalentes não são fonte de backlog. Quando um débito, auditoria ou plano precisar sobreviver à conversa atual ou atravessar múltiplos PRs, registre-o em issues do GitHub. `docs/` descreve o estado vivo do produto e da engenharia.
3. **Documentação sempre atualizada**: mudança de comportamento, rota, capacidade ou fluxo atualiza o documento correspondente na mesma entrega. As entradas operacionais canônicas são `docs/DEVELOPMENT.md` e `docs/PRODUCTION.md`.
4. **Segurança da API**: leia `docs/architecture/security.md` antes de adicionar qualquer rota. A API é um processo privilegiado local: nada de shell arbitrário, `cwd` sempre do `ProjectStore`, catálogo de ações fechado, autenticação/origem conforme a política vigente e schemas de resposta explícitos.
5. **CLI bash e web são independentes**: mudanças em `lib/*` não precisam tocar em `apps/`/`packages/` e vice-versa. Se precisar de compartilhamento, decida deliberadamente e documente.
6. **UI dupla no CLI bash**: qualquer função interativa deve suportar `gum` **e** o fallback puro (`read -r -p` + menu numerado).
7. **Rastreabilidade de trabalho amplo**: uma issue de engenharia deve, quando aplicável, registrar problema, objetivo, escopo, prioridade, dependências e critérios de aceite. O PR correspondente referencia a issue e registra o resultado real, decisões, riscos e validação.

## Layout do repositório

```text
apps/
  api/         # Fastify, escuta em 127.0.0.1
  web/         # Vue 3 + Vite SFCs, consome apenas a API
packages/
  contracts/         # Tipos TS puros compartilhados
  core/              # Configuração de workspaces, token local
  project-discovery/ # Detecção de projetos (Rails / Node)
  process-manager/   # Ciclo de vida de processos gerenciados
lib/                 # CLI bash original (carregado pelo ~/.bashrc)
docs/                # Documentação viva do produto e da engenharia
  architecture/      # overview.md, security.md, api-reference.md etc.
init.sh              # Entry point do CLI bash
```

## Comandos que você provavelmente vai rodar

```bash
npm ci                         # instalação reproduzível
npm run dev                    # API (:4343) + web (:5174) juntos
npm run check                  # gate obrigatório: lint + test + build:apps
npm run typecheck              # validação isolada de tipos
npm run format:check           # Prettier, sem regravar
npm run test:coverage          # coverage sob demanda
npm run test:cli               # suíte do CLI bash
npm run test:e2e               # smoke Playwright da web
npm run doctor                 # diagnóstico local
```

`build:packages` roda `contracts → core → project-discovery → process-manager`. Os apps importam **`dist/`**, não o TS fonte. `npm test` preserva `pretest`, portanto compila os packages compartilhados antes da suíte.

Para setup e fluxo completo, leia [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Para produção do próprio Dashboard, leia [`docs/PRODUCTION.md`](docs/PRODUCTION.md).

## Convenções da API (backend `apps/api`)

- Fastify + JSON Schema. Cada rota tem `params`, `body`, `querystring` e `response` declarados explicitamente.
- Schemas de resposta ficam em `apps/api/src/http/response-schemas.ts` e **descartam campos não listados na serialização**.
- Erros passam por `apps/api/src/http/api-error.ts` (`ApiError` e `ApiErrorCode`). Adicionou erro novo? Adicione o código na união.
- Rotas privadas seguem autenticação, sessão e checagem de origem documentadas em `docs/architecture/security.md`; não crie bypass ad hoc. `GET /api/health` é a única rota pública.
- Processos gerenciados usam `packages/process-manager`; processos de script têm lifecycle próprio em `apps/api/src/services/script-execution/`.

## Convenções do frontend (`apps/web`)

- Vue 3 SFCs. Chamadas à API passam por `apps/web/src/api/`; `requestJson` centraliza transporte e erro.
- Nunca acesse filesystem, execute comandos ou faça polling em portas a partir do frontend.
- Ao trocar projeto/contexto, requests canceláveis usam `AbortController`; operações não canceláveis descartam respostas obsoletas com `generation/latest-wins`.
- Estados visuais precisam ser honestos: loading só durante trabalho real, ações concorrentes bloqueadas quando necessário, aborts esperados não apresentados como erro e respostas obsoletas descartadas.
- Prefira estado/componentes/composables Vue. Não adicione `MutationObserver`/enhancer global para corrigir feature que pode ser expressa declarativamente.

## Convenções do CLI bash (`lib/`)

- Comandos públicos: `dev-*`, `git-*`, `project-*` em kebab-case, exportados via `export -f`.
- Helpers privados: prefixados com `_`, snake_case, não exportados.
- Cada módulo segue o trio `init.sh` + `helpers.sh` + `run.sh` (ou `start.sh` / `stop.sh` / `logs.sh` / `menu.sh`).
- Módulos opcionais são carregados com `required=false`; sua ausência emite aviso, não aborta.

## Testes

- Node test runner (`node --test`) com `tsx`, exceto `apps/web` (Vitest + Playwright).
- `npm test` executa suítes funcionais sem coverage. Coverage é diagnóstico via `npm run test:coverage` e não possui threshold percentual obrigatório.
- Priorize regra de negócio, contratos, segurança, mutações, concorrência/cleanup, regressões reais e comportamento de UI relevante.
- Guards estáticos continuam válidos quando impedem arquitetura proibida importante, como shell arbitrário ou enhancers globais de DOM.
- `npm run test:cli` deve ser executado quando a mudança tocar o CLI, mas não é job obrigatório de todo PR.
- O CI principal mantém um único `Validate`: preparação nativa + `npm run check`. E2E, CLI, coverage, Node mínimo, format check e typecheck isolado são validações direcionadas conforme risco.

## Como abrir e fechar uma entrega

1. Ler `docs/DEVELOPMENT.md`, `docs/architecture/overview.md` e a documentação específica do domínio. Quando tocar self-production/deployment, ler também `docs/PRODUCTION.md` e os contratos de Produção aplicáveis.
2. Confirmar comportamento atual no código antes de reaproveitar débito/plano antigo; se o trabalho atravessar múltiplos PRs, registrar em issue.
3. Implementar na menor camada correta, adicionando teste quando houver regra/regressão relevante.
4. Para mudança normal, rodar:

```bash
npm run check
```

   Acrescentar `typecheck`, `format:check`, `test:cli`, `test:e2e`, `test:coverage`, docs de API e Node mínimo quando o risco justificar.
5. Atualizar a documentação viva correspondente na mesma entrega.
6. Fazer auto code review do diff, corrigir achados e repetir gates impactados.
7. Abrir PR pequeno e revisável, vinculando issue quando houver, com objetivo, alterações, decisões, riscos e validação.
8. Merge exige autorização explícita do usuário. Mesmo autorizado, só mergear depois de checks exigidos verdes e sem pendências conhecidas.
9. Depois do merge, confirmar `main` e informar comandos locais necessários para atualizar/reiniciar o ambiente quando aplicável.

## Produção e self-update

O próprio Dev Dashboard usa `strategy=self-update`, não `prod:deploy` local.

```bash
npm run prod:status
npm run prod:check
```

`npm run check` valida código/CI; `npm run prod:check` valida o contrato/agent de self-update instalado na máquina. Um não substitui o outro.

Os scripts `self-update:*` são tooling de engenharia. O fluxo suportado passa pelo Production Contract, planner, confirmação vinculada ao `planHash`, handoff, fast-forward da revision confirmada, restart e prova de readiness/revision.

Veja `docs/PRODUCTION.md` e `docs/architecture/self-production.md`.

## O que evitar

- Recriar `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado como backlog.
- Deixar auditoria/débito multi-PR apenas em conversa sem issue.
- Usar `docs/` para trabalho futuro em vez do estado implementado.
- Executar Git de escrita sem instrução direta ou autorização contínua válida.
- Introduzir dependências em `packages/contracts` sem necessidade; ele é intencionalmente puro.
- Aceitar paths absolutos do navegador para filesystem/processo.
- Misturar convenções entre CLI e web sem decisão explícita.
- Adicionar `MutationObserver`/enhancer global para contornar estado/markup Vue.
- Adicionar teste de baixo valor apenas para aumentar coverage.

### Extra

# Diretrizes Universais de Desenvolvimento (Instruções para Agentes de IA)

Você está atuando como o Principal Engineer e Arquiteto de Software deste repositório. Este arquivo define os padrões inegociáveis de engenharia, arquitetura e qualidade que devem ser aplicados a qualquer tecnologia, linguagem ou framework utilizado aqui.

## 1. Engenharia de Código e Manutenibilidade
* **Princípios Práticos:** Aplique KISS, DRY e YAGNI.
* **SOLID Restrito:**
  * Toda classe, função ou componente deve ter uma única responsabilidade.
  * Sistemas devem ser abertos para extensão e fechados para modificação.
  * Dependa de abstrações/interfaces, nunca de implementações concretas diretamente.
* **Legibilidade:** use nomes autoexplicativos e mantenha funções focadas.

## 2. Paradigmas Arquiteturais
* **Separação de Conceitos:** isole domínio de banco, APIs externas, UI e frameworks.
* **Desacoplamento:** componentes/serviços comunicam por contratos claros.
* **Idempotência e Resiliência:** operações de estado devem ser seguras contra retries e integrações externas devem prever falha.

## 3. Qualidade, Testes e Automação
* **Testabilidade:** não misture efeitos colaterais no meio da lógica pura.
* **Testes Automatizados:** implemente testes quando houver regra/regressão relevante; não adicione testes só para elevar coverage.

## 4. Segurança e Estabilidade por Padrão
* **Validação Estrita:** nunca confie em inputs externos.
* **Tratamento de Erros:** capture na camada correta, sem expor secrets/stack traces ao cliente.
* **Dados Sensíveis:** senhas, chaves, PII e tokens não entram em logs, URLs ou código aberto.

## 5. Interfaces com Usuário
* **Estados Visuais:** toda interação deve ter feedback de loading/vazio/sucesso/erro quando aplicável.
* **Consistência e Acessibilidade:** siga o design system/padrões existentes, contraste e semântica acessível.

---
**Protocolo de Ação:** antes de entregar código ou plano, valide se a solução duplica código, quebra separação de responsabilidades ou mistura domínio e infraestrutura. Se sim, corrija antes de responder.
