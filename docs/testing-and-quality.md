# Testes e qualidade

Este documento registra o estado implementado dos gates de qualidade do Dev Dashboard e a política usada para cobertura automatizada.

## Gate principal

Antes de uma mudança ser considerada pronta, o repositório valida a sequência definida pelos scripts raiz:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
```

`npm run format:check` é um gate somente leitura: ele usa `prettier --check` sobre a mesma superfície coberta por `npm run format` e falha quando o conteúdo versionado precisa ser reformatado. O check não reescreve arquivos para produzir um resultado verde.

Quando a alteração afeta um fluxo web crítico, execute também:

```bash
npm run test:e2e
```

O CI executa esses gates sobre o head do pull request. A cobertura unitária da web faz parte de `npm test` e, portanto, uma regressão abaixo do piso configurado bloqueia a entrega.

## Compatibilidade de Node no CI

O contrato público continua sendo o declarado em `package.json`: Node.js `^20.19.0 || >=22.12.0`.

O pipeline usa duas referências deliberadas:

- **Node 20.19.0** é o runtime mínimo validado pelo job `Node mínimo`, que executa `npm ci`, reconstrói `node-pty`, compila packages/apps, roda typecheck e uma suíte de compatibilidade sobre os testes de scripts, API, web, core, process-manager e project-discovery;
- **Node 24** continua sendo o runtime principal do job `Validate` e do smoke E2E.

O job `Validate` depende do resultado do `Node mínimo` e falha explicitamente quando a compatibilidade mínima não passa. Assim, o required check existente continua sendo a fronteira de merge, enquanto o suporte ao menor runtime deixa de ser apenas documental.

O projeto usa `@types/node` mais recente que o runtime mínimo, por isso a execução real no Node 20.19.0 funciona como gate de compatibilidade equivalente: mudanças que compilam com tipos recentes ainda precisam instalar, construir e executar os testes no runtime mínimo suportado.

Os scripts normais de teste da API e de alguns packages usam flags de threshold de cobertura do runner nativo do Node que não existem no Node 20.19.0. No job de compatibilidade, os **mesmos arquivos de teste** desses workspaces são executados diretamente com `node --test`, sem somente esses flags de cobertura. Os thresholds continuam sendo exigidos no `Validate` em Node 24; o job mínimo existe para validar compatibilidade de runtime, não para duplicar o gate de cobertura.

## CI e build dos packages

Os scripts locais que dependem dos packages preservam seus hooks `pre*` para garantir que `dist/` esteja atualizado antes de `docs:api`, `typecheck`, `test` e dos fluxos de desenvolvimento. Essa proteção é importante porque os apps consomem a saída compilada dos packages, não o TypeScript fonte diretamente.

No job `Validate`, o CI evita repetir essa compilação em cada gate:

1. executa `npm run build:packages` uma única vez após instalar as dependências e reconstruir `node-pty`;
2. gera a referência da API sem executar formatter mutável;
3. reutiliza os artefatos compilados nas etapas de documentação, typecheck e testes executando os scripts raiz com `--ignore-scripts`, o que ignora apenas os hooks `pre*`/`post*` e mantém o script principal;
4. valida formatação com `npm run format:check`, que apenas lê os arquivos;
5. no step de build, executa `npm run build:apps`, pois os packages já foram compilados no início do job.

Essa otimização é específica do pipeline. No desenvolvimento local, continue usando os comandos públicos normais sem `--ignore-scripts`, para não mascarar um `dist/` desatualizado.

## Jornadas E2E críticas

O Playwright protege poucos fluxos de alto valor em navegador real, evitando transformar o smoke em uma segunda suíte unitária lenta. A seleção atual cobre:

- Git: criação/troca de branch, erro de mutação e commit real sobre a fixture;
- Banco: conexão, navegação de catálogo/tabelas, leitura, isolamento da credencial e comportamento de foco do diálogo;
- lifecycle: start/stop real do Sidekiq e start/stop da UI de servidor do projeto;
- recuperação: falha de carga após esgotar os retries GET automáticos, estado de erro e sucesso ao executar `Tentar novamente`;
- teclado: foco preso/retorno de foco em diálogo, `Escape` e ativação do retry com `Enter`.

Mocks de rede são aceitáveis quando tornam um erro determinístico ou isolam um contrato de UI. Quando o risco é integração com filesystem/processo/Git, prefira a fixture real e mantenha cleanup explícito. O catálogo detalhado e as instruções de execução ficam em `apps/web/e2e/README.md`.

## Supply chain

A automação de supply chain é deliberadamente pequena e explícita:

- Dependabot verifica semanalmente dependências npm e GitHub Actions, com limite de PRs abertos para evitar ruído;
- todo uso de action externa nos workflows versionados é fixado por SHA completo; o comentário ao lado do SHA registra a versão humana e o Dependabot mantém o pin atualizado;
- o workflow `Security` executa Dependency Review em pull requests e bloqueia a introdução de vulnerabilidades de severidade alta ou crítica;
- CodeQL analisa JavaScript/TypeScript em PRs internos, em pushes para `main` e semanalmente;
- CodeQL é omitido em PRs de forks e do Dependabot, onde o token de `pull_request` não possui autoridade de escrita para publicar SARIF; o mesmo código continua sendo analisado após chegar à `main`;
- jobs normais mantêm `contents: read`; permissões de escrita permanecem limitadas aos workflows de release e ao envio de resultados de segurança que realmente exigem essa autoridade.

Não substitua um SHA por uma tag mutável como `@v4`. Para atualizar uma action manualmente, resolva uma release confiável para o SHA correspondente e preserve o comentário de versão. Atualizações rotineiras devem preferencialmente chegar via Dependabot e passar pelos mesmos gates do restante do código.

## Cobertura da web

A suíte web usa Vitest com provider V8. O escopo unitário é `src/**/*.{ts,vue}` e as exclusões explícitas ficam centralizadas em `apps/web/vitest.config.ts`.

Os pisos globais atuais são:

| Métrica | Piso |
| --- | ---: |
| Statements | 59% |
| Branches | 51% |
| Functions | 65% |
| Lines | 61% |

Os shells de aplicação, router e superfícies explicitamente listadas no `exclude` do Vitest permanecem fora do gate unitário quando sua responsabilidade é validada pela suíte Playwright. A lista de exclusões não deve crescer apenas para melhorar percentuais.

Para executar o mesmo gate de cobertura da web usado pelo workspace:

```bash
npm run test -w dev-dashboard-web
```

## Política de ratchet

Cobertura funciona como ratchet: o piso pode permanecer estável ou subir, mas não deve ser reduzido para acomodar código novo sem uma justificativa técnica explícita.

Ao elevar o piso:

1. adicione testes de comportamento sobre lógica de produção relevante, incluindo sucesso, erro e caminhos condicionais quando aplicável;
2. mantenha o escopo de cobertura honesto, sem criar exclusões para produzir ganho artificial;
3. eleve os thresholds apenas até um valor sustentado pelo head do pull request;
4. confirme o novo piso no CI junto com typecheck, lint, formatação, build e demais testes;
5. registre mudanças futuras de meta/roadmap em issues, mantendo este documento focado somente no estado implementado.

A prioridade é aumentar confiança sobre comportamento crítico, não maximizar um número isolado.
