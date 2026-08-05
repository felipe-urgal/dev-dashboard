# Task 105 — Revisão dirigida do `npm audit`

## Objetivo

Transformar o resultado do `npm audit` em um inventário confiável e acionável,
separando risco real para o runtime local de ruído de ferramentas de
desenvolvimento, sem usar `npm audit fix --force` nem upgrades principais
automáticos.

## Resultado do `npm audit --json` (lockfile atual)

```
2 vulnerabilities (1 low, 1 moderate)
477 dependências resolvidas (161 prod, 257 dev, 62 optional, 1 peer)
```

Um único par de achados, ambos na mesma cadeia:

| Pacote | Severidade | Direto? | Cadeia | Advisories |
| --- | --- | --- | --- | --- |
| `dompurify` (`<=3.4.11`) | moderate | não (transitivo) | `apps/web` → `monaco-editor@0.56.0` → `dompurify@3.4.8` | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) (low), [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882) (moderate), [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9) (low) |
| `monaco-editor` (`0.56.0`, via `dompurify`) | low | sim (`apps/web/package.json`) | idem | idem |

Não há achados `high`/`critical`, e nenhum outro workspace (`apps/api`,
`packages/*`) aparece no relatório.

## Investigação da cadeia `monaco-editor` → `dompurify`

- `monaco-editor@0.56.0` é a versão estável mais recente publicada (`npm view
  monaco-editor dist-tags` → `latest: 0.56.0`); não existe upgrade minor/patch
  disponível.
- O `fixAvailable` sugerido pelo `npm audit` é `monaco-editor@0.53.0`,
  marcado como `isSemVerMajor: true` — ou seja, um **downgrade** de versão
  maior, não um upgrade. Investigando `npm view monaco-editor@0.53.0
  dependencies`, essa versão nem declara `dompurify` como dependência
  (`@types/trusted-types` apenas), o que indica que a resolução automática do
  `npm audit` está incorreta aqui — não é um caminho de correção real.
- Mais importante: `monaco-editor` **não usa o pacote `dompurify` resolvido
  pelo npm em tempo de execução**. Ele vendoriza sua própria cópia interna em
  `node_modules/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js`
  (`DOMPurify.version = '3.4.8'`), importada por caminho relativo a partir de
  `domSanitize.js`. A entrada `"dompurify": "3.4.8"` no `package.json` do
  monaco parece não ser consumida pelo código publicado.
- Consequência prática: mesmo um `overrides` forçando uma versão mais nova de
  `dompurify` no `package-lock.json` **não alteraria o código realmente
  executado**, porque o monaco não importa o pacote `dompurify` de
  `node_modules` — ele embute sua própria cópia no bundle publicado. Não há
  upgrade patch/minor compatível que resolva isso; a correção real depende de
  uma futura versão do `monaco-editor` que atualize sua cópia vendorizada.

## Decisão

**Nenhuma alteração de dependência foi aplicada nesta task.** Não existe
upgrade compatível (patch/minor) disponível: o único caminho sugerido pelo
`npm audit` é um downgrade de major do `monaco-editor`, que também não
resolveria o problema na prática (a cópia vendorizada de `dompurify` não
depende do pacote `dompurify` do npm).

### Risco documentado — `dompurify` vendorizado em `monaco-editor@0.56.0`

- **O quê**: três advisories de bypass/poluição de configuração no
  sanitizador HTML do DOMPurify (`CUSTOM_ELEMENT_HANDLING`, `setConfig()`,
  `clearConfig()`), potencialmente permitindo XSS se conteúdo não confiável
  for sanitizado e injetado no DOM.
- **Onde é usado no produto**: `monaco-editor` usa sua cópia de DOMPurify para
  sanitizar HTML/Markdown renderizado no editor embutido — principalmente
  hovers, diagnósticos e documentação vindos do gateway LSP local
  (JavaScript/TypeScript e Ruby/Rails, tasks 078/079) e das ferramentas do
  assistente de IA local (task 080+).
- **Exposição real**: a API só escuta em `127.0.0.1` (`docs/architecture/security.md`),
  o conteúdo sanitizado vem de processos LSP/IA rodando localmente sobre o
  código do próprio usuário — não há canal de conteúdo remoto/multiusuário
  atravessando esse sanitizador. Aplicação single-user, local-only; a
  superfície de exploração prática é baixa.
- **Mitigação existente**: nenhuma mitigação de produto foi adicionada por
  esta task além do isolamento local já existente (rede loopback, catálogo
  fechado de operações, token de API). Não há ação de código pendente porque
  não há upgrade compatível a aplicar.
- **Condição objetiva para reavaliar**: reexecutar `npm audit` a cada revisão
  de dependências (ou quando `monaco-editor` publicar uma nova versão) e
  verificar se a cópia vendorizada em
  `node_modules/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js`
  passou a reportar uma versão `>=3.4.12` (onde os três advisories acima estão
  corrigidos). Se sim, o achado desaparece do `npm audit` sem exigir nenhuma
  mudança de código deste repositório.

## `npm outdated` — pacotes sem relação com os achados do audit

`npm outdated` lista alguns pacotes com versão `wanted` mais nova
(`fastify`, `@playwright/test`, `@types/node`, `tsx`, `vue`, `vue-tsc`,
`typescript-eslint`, `vite`) e alguns com apenas `latest` major disponível
(`eslint`, `jsdom`, `typescript`, `globals`). Nenhum deles aparece no
relatório do `npm audit` — são apenas atualizações rotineiras, fora do
escopo desta task (ver "Fora de escopo" abaixo e a decisão já registrada em
`tasks/PENDENCIAS.md` de não misturar modernização geral de dependências com
a revisão de vulnerabilidades).

## Validação

- `npm run lint` — 0 erros (17 warnings preexistentes, não relacionados).
- `npm run typecheck` — sem erros em nenhum workspace.
- `npm run build` — build completo (`packages` → `apps`) sem erros.
- `npm run docs:api:check` — `docs/architecture/api-reference.md` já
  atualizado (157 rotas).
- `npm test` — suíte completa (`apps/api`, `apps/web`, `packages/*`,
  `scripts/*.test.mjs`) sem falhas.
- `package-lock.json` inalterado — nada foi instalado/atualizado, então
  continua consistente com `npm ci`.

## Fora de escopo (confirmado)

- modernização geral de dependências sem relação com vulnerabilidades
  (`npm outdated` acima);
- troca de framework, bundler ou runner de testes;
- correção de alertas do CLI Bash ou de dependências dos projetos gerenciados
  pelo dashboard;
- automatizar atualização recorrente de dependências.

## Arquivos alterados

- `tasks/105-npm-audit-review.md` (este arquivo).
- `tasks/PENDENCIAS.md`, `tasks/README.md`, `tasks/NEXT.md` (registro e
  reconciliação, ver commit).
