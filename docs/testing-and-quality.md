# Testes e qualidade

Este documento descreve o estado implementado dos gates de qualidade do Dev Dashboard e o critério para decidir quais testes devem existir.

## Princípio

A suíte deve maximizar confiança por tempo e manutenção investidos.

Priorize testes que protegem:

- regras de negócio e contratos;
- segurança, autorização e limites de entrada;
- mutações Git/processo/banco/produção;
- concorrência, cleanup e descarte de respostas obsoletas;
- regressões já observadas;
- comportamento de UI que o usuário realmente percebe.

Evite testes que existam apenas para defender um percentual de cobertura ou congelar detalhes internos sem impacto funcional, como texto literal de CSS, ordem incidental de imports ou atalhos artificiais exclusivos do ambiente de teste.

Guards estáticos continuam válidos quando protegem uma decisão arquitetural importante e difícil de expressar por lint/tipos, por exemplo impedir a reintrodução de `MutationObserver`, enhancers globais de DOM, shell arbitrário ou diálogos nativos proibidos.

## Gate principal do pull request

O workflow `CI` usa Node 24 e mantém um único job `Validate`:

```text
npm ci --ignore-scripts
npm rebuild esbuild node-pty
npm run lint
npm test
npm run build:apps
```

`npm test` preserva o hook `pretest`, portanto os packages compartilhados são compilados antes da suíte. A cobertura não faz parte desse caminho obrigatório.

O objetivo do PR é responder rapidamente três perguntas:

1. o código respeita as regras estáticas relevantes?
2. os comportamentos automatizados continuam corretos?
3. as aplicações continuam compilando?

Typecheck isolado, formatação, CLI Bash, Node mínimo e Playwright continuam disponíveis como verificações direcionadas, mas não são jobs obrigatórios em todo PR.

## Testes locais

Validação padrão para uma mudança normal:

```bash
npm run lint
npm test
npm run build
```

Use verificações adicionais conforme o risco:

```bash
npm run typecheck       # quando tipos/configuração de build merecem inspeção isolada
npm run format:check    # antes de finalizar mudanças extensas de código/docs
npm run test:cli        # quando lib/, init.sh ou fluxo Bash mudar
npm run test:e2e        # quando uma jornada web crítica mudar
npm run test:coverage   # quando for útil inspecionar lacunas de cobertura
```

Mudanças em rotas/schemas também devem validar a referência gerada:

```bash
npm run docs:api
npm run docs:api:check
```

## Cobertura

Cobertura é um diagnóstico, não um gate percentual.

O comando raiz:

```bash
npm run test:coverage
```

executa as mesmas suítes automatizadas com coleta de cobertura nos workspaces que a suportam. API e packages usam a cobertura experimental do Node; a web usa Vitest + V8.

Não existem thresholds mínimos globais bloqueando PR ou execução de coverage. Um percentual baixo pode indicar uma área que merece atenção, mas não justifica sozinho adicionar testes sem valor. Da mesma forma, um percentual alto não prova que os cenários relevantes estão protegidos.

Ao revisar cobertura:

- procure regras críticas sem teste;
- prefira casos de sucesso, falha e condição relevantes a linhas triviais;
- não adicione exclusões só para melhorar o número;
- não escreva teste de implementação apenas para aumentar percentual;
- trate regressões reais como prioridade maior que cobertura uniforme.

A configuração web mantém exclusões explícitas em `apps/web/vitest.config.ts` para superfícies cuja medição unitária produziria sinal pouco útil. Essas exclusões devem continuar justificáveis por responsabilidade, não por percentual.

## Critério para manter ou remover testes

Mantenha um teste quando ele satisfizer pelo menos um destes pontos:

- falharia diante de uma regressão plausível e relevante;
- protege um contrato público ou regra de domínio;
- protege uma fronteira de segurança;
- cobre integração com filesystem, Git, processo, banco ou provider;
- documenta um bug já ocorrido;
- verifica um comportamento de UI difícil de garantir por tipos/lint.

Considere remover ou reescrever quando:

- testa somente detalhe de implementação sem contrato;
- duplica outro teste em uma camada mais adequada;
- lê código/CSS como texto para congelar detalhe visual incidental;
- valida comportamento artificial criado apenas pelo próprio harness;
- exige manutenção frequente sem ter encontrado regressões relevantes.

Remover um teste não significa remover a regra. Quando a regra for importante, mova a proteção para a camada mais barata e estável possível: tipos, lint, schema, função pura, teste de unidade ou integração apropriada.

## Jornadas E2E

Playwright permanece reservado a poucos fluxos de alto valor em navegador real. Ele não roda automaticamente em todo PR.

Use E2E quando a mudança depender da integração entre UI, router, API e ambiente real, especialmente para:

- mutações Git;
- exploração de banco;
- lifecycle de processos;
- recuperação após falhas;
- foco/teclado em fluxos críticos.

Evite duplicar em Playwright regras já bem cobertas por unidade/componente.

## CLI Bash

A suíte `npm run test:cli` continua disponível para helpers não interativos do CLI e deve ser executada quando mudanças tocarem `lib/`, `init.sh` ou contratos Bash relacionados.

Funções interativas continuam exigindo validação proporcional ao escopo, incluindo fallback sem `gum` quando aplicável.

## Compatibilidade de Node

O contrato público permanece `^20.19.0 || >=22.12.0` no `package.json`.

O CI principal usa Node 24. Mudanças que alterem dependências, APIs de plataforma ou runtime devem validar também Node 20.19.0 quando houver risco de incompatibilidade. Essa checagem é direcionada e não um job permanente em todo PR.

## Dependências nativas

No CI, a instalação usa:

```bash
npm ci --ignore-scripts
npm rebuild esbuild node-pty
```

Isso evita scripts nativos implícitos e repetidos durante `npm ci`, preparando explicitamente apenas os binários necessários no runner Linux.

## Supply chain

A automação de segurança permanece separada do caminho crítico dos PRs:

- Dependabot verifica dependências npm e GitHub Actions;
- referências `uses:` permanecem fixadas por SHA completo;
- CodeQL roda semanalmente ou manualmente;
- o workflow de segurança não adiciona jobs ao pull request normal;
- permissões do `GITHUB_TOKEN` permanecem mínimas por job.

Segurança não depende apenas de scanners: schemas, validação, catálogo fechado de ações, testes de fronteira e revisão continuam sendo as proteções principais do produto.

## Regra prática

Antes de adicionar um novo teste, pergunte:

> Qual regressão importante este teste detecta que outra camada não detecta melhor?

Se a resposta não estiver clara, provavelmente o teste não precisa existir ainda.
