# Testes e qualidade

Este documento descreve o estado implementado dos gates de qualidade do Dev Dashboard e o critério para decidir quais testes devem existir. O fluxo operacional do dia a dia está em [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Princípio

A suíte deve maximizar confiança por tempo e manutenção investidos.

Priorize testes que protegem:

- regras de negócio e contratos;
- segurança, autorização e limites de entrada;
- mutações Git/processo/banco/produção;
- concorrência, cleanup e descarte de respostas obsoletas;
- regressões já observadas;
- comportamento de UI que o usuário realmente percebe.

Evite testes que existam apenas para defender um percentual de cobertura ou congelar detalhes internos sem impacto funcional.

Guards estáticos continuam válidos quando protegem uma decisão arquitetural importante e difícil de expressar por lint/tipos, por exemplo impedir a reintrodução de shell arbitrário ou outros padrões explicitamente proibidos.

## Gate principal do pull request

A interface canônica é:

```bash
npm run check
```

Hoje ela executa:

```text
lint
-> test
-> build:apps
```

O workflow `CI` usa Node 24 e mantém um único job `Validate`:

```text
npm ci --ignore-scripts
-> npm rebuild esbuild node-pty
-> npm run check
```

`npm test` preserva o hook `pretest`, portanto os packages compartilhados são compilados antes da suíte. A cobertura não faz parte desse caminho obrigatório.

O objetivo do PR é responder rapidamente três perguntas:

1. o código respeita as regras estáticas relevantes?
2. os comportamentos automatizados continuam corretos?
3. as aplicações continuam compilando?

Não mantenha uma segunda lista de `lint`, `test` e build no workflow ou na documentação: altere primeiro `npm run check` quando o contrato obrigatório realmente mudar.

## Checks direcionados

Typecheck isolado, formatação, CLI Bash, Node mínimo, Playwright e coverage continuam disponíveis conforme o risco:

```bash
npm run typecheck
npm run format:check
npm run test:cli
npm run test:e2e
npm run test:coverage
```

### Typecheck

Use `npm run typecheck` quando tipos/configuração de build merecerem inspeção separada. O CI normal não o repete como etapa fixa hoje.

### Formatação

Use `npm run format:check` antes de finalizar mudanças extensas ou quando houver risco de drift de Prettier.

### CLI Bash

`npm run test:cli` continua disponível para helpers não interativos do CLI e deve ser executado quando mudanças tocarem `lib/`, `init.sh` ou contratos Bash relacionados.

### E2E

Playwright permanece reservado a poucos fluxos de alto valor em navegador real. Ele não roda automaticamente em todo PR.

Use E2E quando a mudança depender da integração entre UI, router, API e ambiente real, especialmente para:

- mutações Git;
- exploração de banco;
- lifecycle de processos;
- recuperação após falhas;
- foco/teclado em fluxos críticos.

Evite duplicar em Playwright regras já bem cobertas por unidade/componente.

### Coverage

Coverage é um diagnóstico, não um gate percentual.

```bash
npm run test:coverage
```

O comando executa as suítes automatizadas com coleta de cobertura nos workspaces que a suportam. Não existem thresholds mínimos globais bloqueando PR.

Ao revisar coverage:

- procure regras críticas sem teste;
- prefira casos de sucesso/falha relevantes;
- não adicione exclusões ou testes artificiais só para melhorar o número.

## API docs

Mudanças em rotas/schemas também devem validar a referência gerada:

```bash
npm run docs:api
npm run docs:api:check
```

A referência gerada em `docs/architecture/api-reference.md` não é editada manualmente.

## Compatibilidade de Node

O contrato público permanece `^20.19.0 || >=22.12.0` no `package.json`.

O CI principal usa Node 24. Mudanças que alterem dependências, APIs de plataforma ou runtime devem validar também Node 20.19.0 quando houver risco de incompatibilidade. Essa checagem é direcionada, não um job permanente.

## Dependências nativas

No CI, a instalação usa:

```bash
npm ci --ignore-scripts
npm rebuild esbuild node-pty
```

Isso evita scripts nativos implícitos/repetidos durante `npm ci`, preparando explicitamente os binários necessários no runner Linux.

## Supply chain

A automação de segurança permanece separada do caminho crítico dos PRs:

- Dependabot verifica dependências npm e GitHub Actions;
- referências `uses:` permanecem fixadas por SHA completo;
- CodeQL roda semanalmente ou manualmente;
- o workflow de segurança não adiciona jobs ao pull request normal;
- permissões do `GITHUB_TOKEN` permanecem mínimas por job.

Segurança não depende apenas de scanners: schemas, validação, catálogo fechado de ações, testes de fronteira e review continuam sendo as proteções principais.

## Produção

O gate normal de engenharia não deve ser confundido com a self-production:

```bash
npm run check       # código/CI
npm run prod:check  # infraestrutura do self-update local
```

O segundo valida o contrato `strategy=self-update` e o agent instalado; ele não faz parte do CI genérico. Veja [`PRODUCTION.md`](PRODUCTION.md).

## Falhas

Não faça retry cego nem enfraqueça checks para obter verde.

1. reproduza;
2. identifique a causa;
3. diferencie regressão, contrato stale, teste incorreto e infraestrutura;
4. corrija a fonte adequada;
5. gere novo SHA;
6. reexecute os gates aplicáveis;
7. refaça o auto-review final.

## Regra prática

Antes de adicionar um novo teste, pergunte:

> Qual regressão importante este teste detecta que outra camada não detecta melhor?

Se a resposta não estiver clara, provavelmente o teste não precisa existir ainda.
