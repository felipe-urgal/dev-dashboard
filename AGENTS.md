# AGENTS.md

Guia rápido para agentes de IA (Claude Code, Cursor, Copilot, etc.) que
forem trabalhar neste repositório. Complementa o `CLAUDE.md` — leia
ambos antes de editar qualquer arquivo.

## O que é este projeto em uma frase

Um repositório com **duas interfaces** para o mesmo domínio: um CLI bash
em `lib/` (carregado no shell do usuário via `init.sh`) e um dashboard
web TypeScript em `apps/` + `packages/`. Nenhum dos dois substitui o
outro; o web reaproveita conceitos por trás de uma API HTTP local.

## Regras de ouro

1. **Idioma**: todo texto criado ou editado (UI, comentários, mensagens
   de commit, documentação, PRs) é em **português brasileiro**.
2. **Planejamento em issues, não em arquivos de backlog**: a pasta `tasks/`
   foi removida deliberadamente e não deve ser recriada. `NEXT.md`,
   `PENDENCIAS.md`, roadmaps versionados e arquivos equivalentes não são fonte
   de backlog. Quando um débito, auditoria ou plano precisar sobreviver à
   conversa atual ou atravessar múltiplos PRs, registre-o em issues do GitHub.
3. **Documentação sempre atualizada**: todo ajuste, correção ou nova
   funcionalidade que muda comportamento, rota, capacidade ou fluxo
   precisa atualizar o documento correspondente em `docs/` na mesma entrega.
4. **Segurança da API**: leia `docs/architecture/security.md` antes de
   adicionar qualquer rota. A API é um processo privilegiado local:
   nada de shell arbitrário, `cwd` sempre do `ProjectStore`, catálogo
   de ações fechado, autenticação/origem conforme a política vigente e
   schemas de resposta explícitos.
5. **CLI bash e web são independentes**: mudanças em `lib/*` não
   precisam tocar em `apps/`/`packages/` e vice-versa.
6. **UI dupla no CLI bash**: qualquer função interativa deve suportar
   `gum` **e** o fallback puro (`read -r -p` + menu numerado).
7. **Rastreabilidade de trabalho amplo**: uma issue de engenharia deve, quando
   aplicável, registrar problema, objetivo, escopo, prioridade, dependências e
   critérios de aceite. O PR correspondente referencia a issue e registra o
   resultado real, decisões, riscos e validação.

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
init.sh              # Entry point do CLI bash
```

## Comandos que você provavelmente vai rodar

```bash
npm install                    # uma vez, na raiz
npm run lint                   # validação estática principal
npm test                       # suítes funcionais sem coverage
npm run build                  # packages primeiro, depois apps
npm run test:coverage          # relatório de coverage sob demanda
npm run typecheck              # checagem de tipos isolada quando útil
npm run format:check           # Prettier, sem regravar
npm run test:cli               # suíte do CLI quando lib/init.sh mudar
npm run test:e2e               # Playwright quando o fluxo crítico justificar
npm run dev                    # API (:4343) + web (:5174) juntos
```

`build:packages` roda `contracts → core → project-discovery →
process-manager`. Os apps importam **`dist/`**, não o TS fonte — se
esqueceu de rebuildar após editar um package, o typecheck pode mentir.

## Política de testes

O padrão não é maximizar quantidade de testes nem percentual de coverage. O
objetivo é proteger regressões relevantes com a camada mais simples possível.

Mantenha testes para regras de negócio, contratos, segurança, mutações,
concorrência/cleanup, regressões reais e comportamento de UI importante.
Evite testes que apenas congelem detalhe incidental de CSS/markup/imports ou
que existam só para elevar coverage.

Guards estáticos continuam válidos quando impedem uma arquitetura explicitamente
proibida e relevante, por exemplo `MutationObserver`/enhancers globais de DOM,
shell arbitrário ou diálogos nativos.

Coverage é diagnóstico sob demanda via `npm run test:coverage` e **não possui
threshold percentual obrigatório**.

O CI de PR mantém um único `Validate`: instalação otimizada, lint, `npm test` e
build dos apps. CLI Bash, E2E, coverage, Node mínimo, format check e typecheck
isolado são validações direcionadas conforme o risco da mudança.

## Convenções da API (backend `apps/api`)

- Fastify + JSON Schema. Cada rota tem `params`, `body`, `querystring`
  e `response` declarados explicitamente.
- Schemas de resposta ficam em `apps/api/src/http/response-schemas.ts` e
  **descartam campos não listados na serialização**.
- Erros passam por `apps/api/src/http/api-error.ts` (`ApiError` e `ApiErrorCode`).
- Rotas privadas devem seguir integralmente autenticação, sessão e checagem
  de origem; `GET /api/health` é a única rota pública.
- Processos gerenciados usam `packages/process-manager`. Os kinds atuais
  são `'server'`, `'test'`, `'worker'` e `'webpack'`.

## Convenções do frontend (`apps/web`)

- Vue 3 SFCs. Chamadas à API passam pela camada em `apps/web/src/api/`;
  `requestJson` centraliza transporte e tratamento comum de erro.
- Nunca acesse filesystem, execute comandos ou faça polling em portas
  a partir do frontend — é responsabilidade da API.
- Ao trocar de projeto/contexto, requests canceláveis devem usar
  `AbortController`; operações que não podem ser canceladas devem descartar
  respostas obsoletas com `generation/latest-wins`.
- Rotas ficam em `apps/web/src/router/index.ts`.
- Estados visuais precisam ser honestos: loading só durante trabalho real,
  ações concorrentes bloqueadas quando necessário, aborts esperados não
  apresentados como erro e respostas obsoletas descartadas.
- Prefira estado/componentes/composables Vue. Não adicione pós-processamento
  global de DOM, `MutationObserver` ou enhancer imperativo para corrigir uma
  feature que pode ser expressa declarativamente.

## Convenções do CLI bash (`lib/`)

- Comandos públicos: `dev-*`, `git-*`, `project-*` em kebab-case,
  exportados via `export -f`.
- Helpers privados: prefixados com `_`, snake_case, não exportados.
- Cada módulo segue o trio `init.sh` + `helpers.sh` + `run.sh` (ou arquivos
  por verbo). Não invente convenção nova.
- Módulos opcionais são carregados com `required=false`; sua ausência emite
  aviso, não aborta.

## Testes por camada

- Node test runner (`node --test`) com `tsx` para API/packages.
- `apps/web`: Vitest para unitários/componentes e Playwright para E2E.
- CLI bash: `tests/cli/run.sh` cobre helpers não interativos.
- Funções interativas do CLI continuam validadas proporcionalmente ao escopo,
  incluindo os caminhos com `gum` e fallback puro quando alterados.

Antes de adicionar um teste, responda: **qual regressão importante ele detecta
que tipos, lint ou outro teste mais simples não detectam melhor?**

## Como abrir e fechar uma entrega

1. Ler `docs/architecture/overview.md`, `docs/development-guide.md` e a
   documentação específica do domínio. Consultar issues e PRs relacionados.
2. Confirmar o comportamento atual no código antes de reaproveitar débito ou
   plano antigo.
3. Implementar na menor camada correta, adicionando teste automatizado quando
   existir uma regressão/regra relevante a proteger.
4. Para uma mudança normal, rodar `npm run lint && npm test && npm run build`.
   Acrescentar `typecheck`, `format:check`, `test:cli`, `test:e2e`,
   `test:coverage` e validação de Node mínimo quando o risco justificar.
5. Atualizar a documentação viva correspondente na mesma entrega.
6. Fazer auto code review do diff e repetir os gates impactados.
7. Abrir PR pequeno e revisável com objetivo, alterações, decisões, riscos,
   validação e impacto visual.
8. Merge exige autorização explícita do usuário. Mesmo autorizado, só mergear
   depois de todos os checks exigidos estarem verdes e sem pendências conhecidas.
9. Depois do merge, confirmar o estado da `main` e informar comandos locais
   necessários quando aplicável.

## O que evitar

- Recriar `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou outro roadmap versionado.
- Deixar auditoria/débito relevante multi-PR apenas em conversa sem issue.
- Usar `docs/` para registrar trabalho futuro em vez do estado implementado.
- Executar `git` de escrita sem instrução direta ou autorização contínua válida.
- Introduzir dependências novas em `packages/contracts`.
- Aceitar caminhos absolutos vindos do navegador para operações privilegiadas.
- Misturar convenções entre CLI bash e web sem decisão deliberada.
- Adicionar `MutationObserver`/enhancer global para contornar estado/markup Vue.
- Deixar `dist/` desatualizado antes de rodar `dev`/`build`/`test`.
- Criar testes de baixo valor apenas para satisfazer coverage.

### Extra

# Diretrizes Universais de Desenvolvimento (Instruções para Agentes de IA)

Você está atuando como o Principal Engineer e Arquiteto de Software deste repositório. Este arquivo define os padrões inegociáveis de engenharia, arquitetura e qualidade que devem ser aplicados a qualquer tecnologia, linguagem ou framework utilizado aqui.

## 1. Engenharia de Código e Manutenibilidade
* **Princípios Práticos:** Aplique KISS, DRY e YAGNI.
* **SOLID Restrito:** funções/componentes com responsabilidade clara e dependências explícitas.
* **Legibilidade:** prefira nomes autoexplicativos e funções pequenas.

## 2. Paradigmas Arquiteturais
* **Separação de Conceitos:** isole domínio de banco, APIs externas e UI.
* **Desacoplamento:** use contratos claros entre componentes/serviços.
* **Idempotência e Resiliência:** operações que alteram estado devem considerar retries e falhas parciais.

## 3. Qualidade, Testes e Automação
* **Testabilidade:** separe lógica pura de efeitos colaterais.
* **Testes Automatizados:** cubra funcionalidade/correção quando houver regra ou regressão relevante; não adicione teste apenas por percentual.

## 4. Segurança e Estabilidade por Padrão
* **Validação Estrita:** nunca confie em inputs externos.
* **Tratamento de Erros:** erros devem ser capturados na camada correta sem expor segredos.
* **Dados Sensíveis:** senhas, chaves, dados pessoais e tokens nunca entram em logs/URLs/código.

## 5. Interfaces com Usuário
* **Estados Visuais:** loading, vazio, sucesso e erro devem ser claros.
* **Consistência e Acessibilidade:** siga os padrões visuais existentes e preserve acessibilidade.

---
**Protocolo de Ação:** antes de entregar, valide se a solução duplica código,
mistura responsabilidades ou adiciona complexidade sem benefício real.
