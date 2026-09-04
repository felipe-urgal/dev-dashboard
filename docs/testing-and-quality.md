# Testes e qualidade

Este documento registra o estado implementado dos gates de qualidade do Dev Dashboard e a política usada para cobertura automatizada.

## Gate principal

Antes de uma mudança ser considerada pronta, a validação local completa continua sendo:

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

O workflow `CI` foi simplificado e, no estado atual, executa em Node 24:

```text
npm ci → npm run lint → npm test → npm run build:apps
```

`npm test` preserva o hook `pretest`, portanto os packages compartilhados são compilados antes da suíte. A cobertura unitária da web faz parte de `npm test` e uma regressão abaixo do piso configurado bloqueia esse gate.

Typecheck, formatação, CLI Bash, Node mínimo e smoke E2E continuam sendo verificações válidas para desenvolvimento/review quando o risco da mudança exigir, mas não são jobs separados do workflow simplificado atual.

## Compatibilidade de Node

O contrato público permanece o declarado em `package.json`: Node.js `^20.19.0 || >=22.12.0`.

O CI principal usa Node 24. O runtime mínimo não possui um job dedicado no workflow atual, então mudanças de dependências e de runtime devem continuar respeitando explicitamente Node 20.19.0. Quando uma atualização declara engines incompatíveis com esse mínimo, elevar o runtime do projeto é uma decisão separada e não deve acontecer implicitamente por causa de uma devDependency.

O projeto usa `@types/node` mais recente que o runtime mínimo. Por isso, em mudanças que tocam runtime, dependências ou APIs de plataforma, vale executar instalação, build e testes também no Node 20.19.0 para detectar incompatibilidades que o typecheck com tipos recentes não evidencia sozinho.

## CI e build dos packages

Os scripts locais que dependem dos packages preservam seus hooks `pre*` para garantir que `dist/` esteja atualizado antes de `docs:api`, `typecheck`, `test` e dos fluxos de desenvolvimento. Essa proteção é importante porque os apps consomem a saída compilada dos packages, não o TypeScript fonte diretamente.

No workflow `CI` atual:

1. `npm ci` instala o lockfile versionado;
2. `npm run lint` valida a superfície TypeScript/Vue;
3. `npm test` dispara `pretest`, compila os packages e executa as suítes dos workspaces;
4. `npm run build:apps` valida o build final das aplicações.

O pipeline deliberadamente evita duplicar toda a matriz de validações locais. Mudanças sensíveis devem complementar o CI com os comandos específicos aplicáveis antes do merge.

## Jornadas E2E críticas

O Playwright protege poucos fluxos de alto valor em navegador real, evitando transformar o smoke em uma segunda suíte unitária lenta. A seleção atual cobre:

- Git: criação/troca de branch, erro de mutação e commit real sobre a fixture;
- Banco: conexão, navegação de catálogo/tabelas, leitura, isolamento da credencial e comportamento de foco do diálogo;
- lifecycle: start/stop real do Sidekiq e start/stop da UI de servidor do projeto;
- recuperação: falha de carga após esgotar os retries GET automáticos, estado de erro e sucesso ao executar `Tentar novamente`;
- teclado: foco preso/retorno de foco em diálogo, `Escape` e ativação do retry com `Enter`.

Mocks de rede são aceitáveis quando tornam um erro determinístico ou isolam um contrato de UI. Quando o risco é integração com filesystem/processo/Git, prefira a fixture real e mantenha cleanup explícito. O catálogo detalhado e as instruções de execução ficam em `apps/web/e2e/README.md`.

O baseline atual do harness web usa **jsdom 27.4.x**, **Vitest 4.1.11** e `@vitest/coverage-v8` **4.1.11** para a suíte unitária, e **Playwright 1.62.x** para o smoke E2E. A linha 27.4 do jsdom preserva o Node 20.19.0 mínimo suportado pelo projeto; elevar o runtime mínimo somente para acompanhar uma dependência de teste exige decisão própria. `vitest` e o provider de cobertura devem permanecer na mesma versão compatível; upgrades de major do runner são entregas isoladas, para que breaking changes não sejam misturados com mudanças funcionais.

O workflow simplificado atual não mantém um job E2E nem um cache de browsers do Playwright. Se o E2E voltar ao CI, a chave de cache deve ser derivada da versão efetivamente resolvida no lockfile, e não de uma versão hard-coded paralela.

## Supply chain

A automação de supply chain é deliberadamente pequena e explícita:

- Dependabot verifica periodicamente dependências npm e GitHub Actions, com limite de PRs abertos para evitar ruído;
- todo uso de action externa nos workflows versionados é fixado por SHA completo; o comentário ao lado do SHA registra a versão humana e o Dependabot mantém o pin atualizado;
- o workflow `Security` executa CodeQL semanalmente e também pode ser disparado manualmente por `workflow_dispatch`;
- a análise de segurança não roda em cada pull request no workflow atual;
- jobs normais mantêm `contents: read`; permissões adicionais permanecem limitadas ao CodeQL e aos fluxos que realmente exigem essa autoridade.

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
4. confirme o novo piso no CI junto com os demais testes e validações aplicáveis;
5. registre mudanças futuras de meta/roadmap em issues, mantendo este documento focado somente no estado implementado.

A prioridade é aumentar confiança sobre comportamento crítico, não maximizar um número isolado.
