# Playbook: diagnosticar e corrigir CI vermelho em um PR

Guia operacional para um agente (ou pessoa) que recebe a tarefa "o CI do PR #NNN está
quebrando, ajusta" no monorepo do dashboard web (`apps/`, `packages/`). Não é sobre o CLI Bash
(`lib/`) — esse não tem CI próprio além de `tests/cli/`.

O objetivo é sempre o mesmo: entender exatamente qual passo do workflow falhou, reproduzir o
mesmo comando localmente, corrigir a causa raiz (não o sintoma) e confirmar antes de empurrar
qualquer coisa.

## 0. Onde olhar primeiro

O workflow relevante é `.github/workflows/ci.yml`, com dois jobs (ver `CLAUDE.md`):

- **Validate**: `typecheck` → `lint` → `format:check` → `build` → `docs:api:check` → `test`, nessa
  ordem, todos na raiz do monorepo.
- **Smoke E2E**: builda e roda `npm run test:e2e` (Playwright) em `apps/web/e2e`.

Os dois jobs rodam em paralelo, então um PR pode ter falhas em ambos ao mesmo tempo por motivos
completamente independentes — trate cada um separadamente, não assuma que corrigir um resolve o
outro.

## 1. Puxe o log real, não adivinhe

Pegue os check runs do PR e o log do job que falhou (via ferramentas de GitHub MCP, ou
`gh run view --log-failed` se estiver em um shell com `gh`). Leia até a linha `##[error]` — o
step imediatamente anterior a ela é o comando que falhou. Não tente corrigir "no escuro": o
log já diz exatamente qual script (`npm run <algo>`) e qual arquivo/teste.

Erros comuns e sua causa típica:

| Mensagem no log                                                                                                      | Causa                                                                               | Correção                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Code style issues found in the above file. Run Prettier with --write to fix.` (job `Validate`, step `format:check`) | Arquivo não formatado com Prettier                                                  | `npx prettier --write <arquivo>`                                                                    |
| `docs/architecture/api-reference.md está desatualizado` (step `docs:api:check`)                                      | Rota/schema Fastify mudou sem regenerar a doc                                       | `npm run docs:api` e commitar o resultado                                                           |
| `expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)` em `responsive.spec.ts` (job Smoke E2E)     | Mudança de layout/CSS quebrou a largura em algum viewport (desktop/tablet/estreito) | Ver seção 3                                                                                         |
| `tsc` reportando erro de tipo                                                                                        | Regressão real de tipagem                                                           | Corrigir o tipo, não usar `any`/`@ts-ignore`                                                        |
| Falha de teste unitário (`node --test`)                                                                              | Regressão de comportamento ou teste desatualizado                                   | Ler a asserção que falhou; corrigir o código ou, se o teste é que ficou obsoleto, atualizar o teste |
| `error TS2322: ... not assignable to type 'DashboardApi'` só dentro de `npm test` (workspace `apps/web`), nunca em `npm run typecheck` | Mock de teste (`test/*.test.ts`) não foi atualizado com um campo novo obrigatório na interface (ex.: nova função da store) | Adicionar o campo faltante no mock/objeto de fixture, não relaxar o tipo |

`npm run typecheck` roda `tsc` sobre `tsconfig.json` de cada workspace, que **não inclui**
`apps/web/test/**`. Erros de tipo em arquivos de teste (mocks incompletos, principalmente) só
aparecem no passo `tsc -p tsconfig.test.json --noEmit` embutido no script `test` do workspace
`apps/web` — ou seja, só rodando `npm test`/`npm run test --workspace=@dev-dashboard/web`, nunca
com `npm run typecheck` isolado. Depois de mudar uma interface de store/API usada por testes
(`DashboardApi`, mocks de `vi.mock('../src/stores/dashboard', ...)`, etc.), rode `npm test` antes
de considerar a validação completa — `typecheck` sozinho não é suficiente.

## 2. Reproduza localmente antes de tocar em código

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Rode só o passo que falhou no CI primeiro, para confirmar que reproduz; só então corrija. Depois
de corrigir, rode a sequência inteira de novo — um fix de formatação pode passar no
`format:check` e mesmo assim quebrar `typecheck` se o arquivo tinha erro de tipo escondido, etc.

Se `apps/api/dist` ou `packages/*/dist` não existirem (erro `Cannot find module
.../dist/server.js` ao rodar E2E manualmente), rode `npm run build` antes — os apps consomem a
saída compilada dos packages, não os fontes TS (ver `CLAUDE.md`, seção "Monorepo do dashboard
web").

## 3. Smoke E2E: overflow horizontal ou visual

`apps/web/e2e/tests/responsive.spec.ts` testa três viewports (`1280`, `820`, `375`) e falha se
`document.documentElement.scrollWidth > clientWidth`. Ao adicionar um elemento com posição
absoluta/fixa (botão de ação extra num card, por exemplo), é fácil estourar a largura só no
viewport mais estreito.

Passo a passo:

1. Rode só esse spec: `npx playwright test --config=e2e/playwright.config.ts
e2e/tests/responsive.spec.ts` a partir de `apps/web/` (depois de `npm run build` na raiz).
2. Se o Playwright reclamar que não encontra o executável do Chromium instalado (versão
   pinada diferente da baixada em `/opt/pw-browsers` neste ambiente), isso é uma limitação do
   ambiente local, não do teste — não é preciso alterar `playwright.config.ts` de verdade.
   Para validar localmente, aponte temporariamente `launchOptions.executablePath` para o
   binário disponível (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`), rode os testes, e
   **reverta esse ajuste antes de commitar** (`git checkout -- e2e/playwright.config.ts`). O CI
   baixa a versão correta sozinho e não sofre desse problema.
3. Ajuste CSS até `expectNoHorizontalOverflow` passar nos três viewports — normalmente reduzindo
   espaçamento/posições de elementos absolutos dentro do breakpoint estreito existente (veja
   `apps/web/src/styles/components/dashboard.css`, blocos `@media (max-width: ...)`), em vez de
   remover funcionalidade.
4. Depois de ajustar, rode o E2E completo (`npx playwright test
--config=e2e/playwright.config.ts`), não só o spec afetado — mudanças de CSS compartilhado
   podem quebrar `visual-baseline.spec.ts` (snapshot visual).

## 4. `docs:api:check`: referência da API desatualizada

Qualquer mudança de rota/schema Fastify sem regenerar a doc quebra esse check
(`CLAUDE.md`: "Todo ajuste... precisa atualizar o documento correspondente"). Correção mecânica:

```bash
npm run docs:api
npm run docs:api:check   # confirma que ficou igual
```

Revise o diff gerado — se ele mexer em rotas que você não tocou, é sinal de que a branch está
desatualizada em relação à `main` (ver seção 5), não de um bug seu.

## 5. Base desatualizada / conflito de merge

Se `mergeable_state` do PR não é `clean`, ou o CI falha em algo que já foi corrigido em outro PR
recente na `main`, a branch provavelmente está atrás. Depois de aplicar as correções de CI:

```bash
git fetch origin main <branch-do-pr>
git checkout <branch-do-pr>
git rebase origin/main
```

Resolva conflitos se houver, rode a sequência de validação da seção 2 de novo (o rebase pode
reintroduzir problemas resolvidos em outro commit), e então:

```bash
git push --force-with-lease origin <branch-do-pr>
```

Só force-push na branch do próprio PR, nunca em `main`. Avise o autor do PR se o force-push for
em uma branch que não é sua (aqui, é esperado quando o pedido é explicitamente "corrige o CI
desse PR" — a branch é do próprio dono do repositório).

## 6. `package-lock.json`: não commite ruído

`npm install` local pode reescrever `package-lock.json` mesmo sem mudança de dependências reais
(diferença de versão do npm/Node entre ambientes). Antes de commitar, confira:

```bash
git diff --stat package-lock.json
```

Se a única mudança do seu trabalho é a correção de CI, descarte esse arquivo
(`git checkout -- package-lock.json`) a menos que você tenha alterado dependências de propósito.

## 7. Depois de empurrar

Confirme que o novo run de CI foi disparado e que os checks relevantes (`Validate`, `Smoke E2E`)
aparecem como `in_progress`/`success` no PR antes de considerar a tarefa concluída. Um push
silencioso sem checar o resultado não é "CI corrigido" — é "CI possivelmente corrigido".

## Checklist rápido

- [ ] Log do job que falhou lido até a linha `##[error]`.
- [ ] Comando reproduzido localmente com o mesmo resultado do CI.
- [ ] Correção aplicada na causa raiz (não supressão de erro/teste).
- [ ] `npm run typecheck && npm run lint && npm run format:check && npm run build && npm run
    docs:api:check && npm test` limpos.
- [ ] E2E relevante (ou suíte completa, se mexeu em CSS/layout compartilhado) verde localmente.
- [ ] `package-lock.json` sem ruído não relacionado.
- [ ] Branch rebaseada em `main` se estava desatualizada.
- [ ] Push feito e novo run de CI confirmado no PR.
