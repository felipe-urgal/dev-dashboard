# Guia de desenvolvimento

Este guia define o fluxo recomendado para alterar o Dev Dashboard com segurança, consistência e documentação suficiente.

## Preparação

```bash
npm install
npm run doctor
npm run dev
```

Abra:

```text
Dashboard:     http://127.0.0.1:5173
Documentação:  http://127.0.0.1:4545
API health:    http://127.0.0.1:4343/api/health
Docs health:   http://127.0.0.1:4545/api/health
```

## Scripts da raiz

| Script | Uso |
|---|---|
| `npm run dev` | Inicia API, web e documentação. |
| `npm run dev:api` | Inicia somente a API com watch. |
| `npm run dev:web` | Inicia somente Vite. |
| `npm run docs:dev` | Inicia somente a central de documentação. |
| `npm run dev-web` | Compila e inicia a distribuição local. |
| `npm run doctor` | Diagnostica ferramentas e portas. |
| `npm run docs:api` | Regenera a referência HTTP. |
| `npm run docs:api:check` | Verifica divergência da referência. |
| `npm run typecheck` | Valida TypeScript. |
| `npm run build` | Compila pacotes e aplicações. |
| `npm test` | Executa testes de scripts e workspaces. |
| `npm run test:e2e` | Executa smoke E2E da web. |

## Ordem de validação

Para feedback rápido:

```bash
npm run typecheck
npm test
npm run build
```

Quando rotas ou schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

Antes de publicar uma alteração relevante:

```bash
npm run typecheck
npm run build
npm test
```

## Como adicionar uma funcionalidade

### 1. Defina o contrato

Responda primeiro:

- qual problema é resolvido;
- qual entidade ou estado é público;
- quais entradas são aceitas;
- quais erros são identificáveis;
- a operação é somente leitura ou mutável;
- existe risco destrutivo;
- o que precisa ser persistido.

Tipos reutilizados por web e API pertencem a `packages/contracts`.

### 2. Escolha a camada correta

- regra genérica e independente de interface: pacote compartilhado;
- integração local ou caso de uso: serviço da API;
- adaptação HTTP: rota;
- apresentação e interação: web;
- automação do monorepo: `scripts`;
- decisão ou explicação: `docs`.

### 3. Implemente a fronteira de segurança

Para qualquer operação que toque o sistema local:

- use IDs conhecidos sempre que possível;
- canonicalize caminhos;
- confirme que o destino está no projeto/workspace permitido;
- escolha programa e argumentos no backend;
- evite `shell: true`;
- aplique timeout e limites;
- masque segredos antes da resposta;
- exija confirmação para ações sensíveis;
- registre resultado sem persistir segredos.

### 4. Adicione a rota

Uma rota deve possuir:

- schema de params, query e body;
- schemas de resposta;
- limites de comprimento e quantidade;
- `additionalProperties: false` quando apropriado;
- tradução de erros internos;
- dependências explícitas no plugin;
- teste de sucesso e falhas importantes.

Depois, registre o plugin em `apps/api/src/app.ts`.

### 5. Atualize a web

A interface deve tratar:

- carregamento inicial;
- vazio;
- erro compreensível;
- sucesso;
- ação em andamento;
- prevenção de clique duplicado;
- confirmação;
- resposta obsoleta após troca de projeto;
- teclado e foco;
- redução de movimento.

Não use mensagens internas da API como identificador de lógica. Prefira códigos ou contratos explícitos.

### 6. Teste a regra, a integração e a interface

| Camada | Tipo de teste |
|---|---|
| Pacote | unidade com filesystem/processo isolado quando necessário |
| Serviço API | unidade e integração com fixtures |
| Rota | injeção Fastify, schemas, auth e tradução de erros |
| Web | Vitest + Vue Test Utils |
| Fluxo crítico | Playwright E2E |
| Script raiz | `node:test` em `scripts/*.test.mjs` |

Testes que iniciam processos devem possuir cleanup mesmo em falha.

### 7. Documente

Atualize:

- referência gerada se a API mudou;
- página de arquitetura se o fluxo mudou;
- guia de operação se novas variáveis, arquivos ou portas surgiram;
- README se o primeiro uso mudou;
- `CONTRIBUTING.md` se o processo mudou;
- `tasks/PENDENCIAS.md` quando houver impacto de planejamento.

## Padrões de TypeScript

- tipos explícitos nas fronteiras;
- unions para estados fechados;
- `unknown` antes de validar erros externos;
- sem `any` como atalho de integração;
- funções pequenas para validação e transformação;
- dependências recebidas por argumento quando precisam ser substituídas;
- sem estado global mutável entre instâncias de app.

## Padrões de processos

Use preferencialmente:

```ts
spawn(command, args, {
  cwd,
  shell: false,
});
```

Defina:

- comando proveniente de catálogo fechado;
- argumentos separados;
- diretório canônico;
- ambiente mínimo ou preparado;
- grupo de processo quando necessário;
- timeout;
- captura limitada de saída;
- estratégia de encerramento.

## Padrões de persistência

Arquivos de configuração e estado devem:

- viver nos diretórios gerenciados;
- possuir formato versionado quando relevante;
- ser escritos atomicamente;
- usar `0700` para diretórios e `0600` para arquivos privados;
- validar conteúdo ao carregar;
- ignorar ou isolar entradas corrompidas;
- evitar caminhos e segredos quando apenas IDs ou preferências bastam.

## Padrões de UI

O projeto prioriza uma experiência simples, ágil e funcional.

- remover elementos redundantes;
- manter ações no contexto onde são usadas;
- preferir uma listagem clara a múltiplos resumos repetidos;
- usar modal quando a ação exige dados relacionados;
- manter largura e hierarquia visual consistentes;
- não animar ícones quando não existe trabalho ativo;
- mostrar estado real, sem sugerir atualização inexistente;
- usar linguagem direta em português.

## API e documentação gerada

`generate-api-docs.mjs` descobre os plugins registrados em `app.ts`, executa as declarações de rota contra um stub de Fastify e gera os schemas reais.

Ao adicionar uma rota:

1. exporte um plugin identificável;
2. importe e registre em `app.ts`;
3. declare schemas completos;
4. execute `npm run docs:api`;
5. revise o diff de `docs/architecture/api-reference.md`.

Não edite manualmente a referência gerada.

## Desenvolvimento da central de documentação

A central não usa dependências adicionais. O servidor:

- escaneia Markdown a cada request de catálogo;
- lê conteúdo no momento da abertura;
- expõe busca textual local;
- serve uma interface estática;
- restringe arquivos ao catálogo e ao repositório.

Para testar:

```bash
node --test scripts/docs-server.test.mjs
npm run docs:dev
```

## Checklist de revisão

- [ ] A responsabilidade está na camada correta.
- [ ] Entradas e caminhos são validados.
- [ ] Não existe execução arbitrária.
- [ ] A operação mutável exige confirmação quando necessário.
- [ ] Logs e respostas possuem limites.
- [ ] Segredos não são retornados ou persistidos indevidamente.
- [ ] O shutdown fecha recursos.
- [ ] Existem testes para sucesso e falhas relevantes.
- [ ] Contratos e documentação foram atualizados.
- [ ] A interface representa o estado real.
- [ ] Typecheck, build e testes passam.
