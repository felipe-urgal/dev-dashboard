# Desenvolvimento

Este é o ponto de entrada canônico para preparar o ambiente local, desenvolver, validar mudanças e abrir PRs no Dev Dashboard.

Documentos especializados continuam em:

- [`development-guide.md`](development-guide.md): engenharia detalhada por camada, segurança, testes e domínio de Produção;
- [`testing-and-quality.md`](testing-and-quality.md): política de testes e checks direcionados;
- [`operations-and-troubleshooting.md`](operations-and-troubleshooting.md): configuração local e diagnóstico;
- [`architecture/overview.md`](architecture/overview.md): visão arquitetural;
- [`architecture/security.md`](architecture/security.md): fronteiras de segurança.

## Pré-requisitos

- Linux;
- Node.js `^20.19.0 || >=22.12.0`;
- npm;
- Git.

O CI principal usa Node 24. Valide Node 20.19.0 separadamente quando a mudança tocar APIs de plataforma, runtime ou dependências e houver risco de incompatibilidade.

## Primeira execução

```bash
npm ci
npm run doctor
npm run dev
```

Serviços padrão:

```text
API: http://127.0.0.1:4343
Web: http://127.0.0.1:5174
```

Quando precisar de configuração local:

```bash
cp .env.example .env.local
```

Secrets, como `VERCEL_TOKEN`, permanecem somente em `.env.local`/ambiente do processo.

## Ciclo normal de desenvolvimento

Depois de implementar a mudança e os testes correspondentes:

1. execute `npm run dev`;
2. valide manualmente o fluxo alterado quando aplicável;
3. execute o gate canônico:

```bash
npm run check
```

`npm run check` representa tudo que é sempre exigido pelo CI funcional atual:

```text
lint
-> test
-> build:apps
```

`npm test` preserva o hook `pretest`, que compila os packages compartilhados antes das suítes. Por isso o gate funciona em checkout limpo sem manter uma segunda lista de preparação dentro do workflow.

## Checks direcionados

Use somente quando o risco/escopo justificar.

### Typecheck isolado

```bash
npm run typecheck
```

Útil quando tipos/configuração de build merecem inspeção separada. Não é repetido como etapa fixa do CI atual.

### Formatação

```bash
npm run format:check
```

Use antes de finalizar mudanças extensas de código ou quando houver risco de drift de Prettier.

### CLI Bash

```bash
npm run test:cli
```

Execute quando `lib/`, `init.sh` ou contratos Bash relacionados mudarem.

### E2E

```bash
npm run test:e2e
```

Reserve para jornadas web críticas em que unidade/componente não provam a integração real entre UI, router, API e ambiente.

### Coverage

```bash
npm run test:coverage
```

Coverage é diagnóstico, não threshold de aprovação.

### API docs

Quando rotas ou schemas mudarem:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada e não deve ser editada manualmente.

## Modos de execução

Desenvolvimento normal:

```bash
npm run dev
```

Somente API/web:

```bash
npm run dev:api
npm run dev:web
```

Distribuição local compilada sem Vite:

```bash
npm run dev-web
```

`dev-web` é um modo real de distribuição local e também compartilha implementação com o runtime usado pelo self-update. Ele não deve ser confundido com o servidor HMR comum.

## CI

O workflow `.github/workflows/ci.yml` executa:

```text
npm ci --ignore-scripts
-> npm rebuild esbuild node-pty
-> npm run check
```

A preparação explícita dos binários nativos evita scripts de instalação implícitos/repetidos durante `npm ci`.

O objetivo é manter uma única interface para o gate obrigatório, em vez de duplicar `lint`, `test` e build no YAML.

## Fluxo recomendado

```text
issue
-> branch curta
-> implementação + testes
-> npm run dev
-> validação manual quando aplicável
-> npm run check
-> checks direcionados quando o risco justificar
-> PR
-> CI no head atual
-> auto code review completo
-> correções
-> novo CI/review se o SHA mudar
-> merge
-> produção conforme PRODUCTION.md quando aplicável
```

## Domínio de Produção

Mudanças no Production Contract, planner, providers, recovery ou UI de Produção exigem leitura adicional de:

- [`architecture/production-contract.md`](architecture/production-contract.md);
- [`architecture/deployment-domain.md`](architecture/deployment-domain.md);
- [`architecture/security.md`](architecture/security.md);
- [`deployment-operations.md`](deployment-operations.md);
- [`production-ui.md`](production-ui.md).

Quando tocar a produção do próprio Dev Dashboard, siga [`PRODUCTION.md`](PRODUCTION.md) e [`architecture/self-production.md`](architecture/self-production.md).

## Antes de declarar pronto

- o `npm run check` passa no head final;
- checks direcionados aplicáveis passaram;
- documentação mudou junto do contrato/comportamento;
- nenhuma credencial entrou em Git/logs/responses;
- o auto-review ocorreu depois do último commit.
