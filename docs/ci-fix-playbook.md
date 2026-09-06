# Playbook: diagnosticar e corrigir CI vermelho em um PR

Guia operacional para investigar o CI atual do Dev Dashboard sem manter uma segunda definição do gate fora de `package.json`.

## 1. Estado atual do CI

O workflow `.github/workflows/ci.yml` possui hoje **um único job obrigatório**:

```text
Validate
```

Ele executa:

```text
npm ci --ignore-scripts
-> npm rebuild esbuild node-pty
-> npm run check
```

A interface canônica é portanto:

```bash
npm run check
```

No estado atual, `check` executa:

```text
format:check
-> lint
-> test
-> build:apps
```

Não existe hoje um segundo job automático de Smoke E2E no PR, nem steps separados de `typecheck` ou `docs:api:check` no workflow.

## 2. Leia o log real antes de mudar código

No PR, abra o run do job **Validate** e identifique qual subcomando dentro do `Quality gate` falhou.

Não tente corrigir pela mensagem resumida do check. Procure a primeira falha concreta e classifique-a:

| Sinal | Primeiro comando para reproduzir |
| --- | --- |
| Prettier / formatação | `npm run format:check` |
| ESLint | `npm run lint` |
| teste unitário/integrado | `npm test` |
| build TypeScript/Vite | `npm run build:apps` |
| falha antes do gate | reproduzir `npm ci --ignore-scripts` / `npm rebuild esbuild node-pty` quando aplicável |

Depois de corrigir a causa, execute o gate completo:

```bash
npm run check
```

## 3. Formatação

`format:check` faz parte do gate obrigatório.

Para corrigir drift no código coberto pelo Prettier do repositório:

```bash
npm run format
npm run format:check
```

Revise o diff antes de commitar. Não formate/reescreva arquivos sem relação só para obter verde.

## 4. Testes

Quando `npm test` falhar:

1. leia a primeira asserção/erro útil;
2. rode a suíte/workspace mais estreito que reproduz;
3. corrija a regra ou o teste stale — não relaxe a asserção só para passar;
4. volte a `npm test`;
5. finalize com `npm run check`.

Lembre que `npm test` usa `pretest` para compilar os packages compartilhados. Um `typecheck` isolado não substitui a suíte, principalmente para fixtures/mocks de teste.

## 5. Typecheck é direcionado

```bash
npm run typecheck
```

Use quando o erro ou a mudança justificar uma validação explícita de tipos. O job `Validate` atual não executa `typecheck` como step separado.

## 6. API docs são direcionadas

Ao alterar rotas ou schemas Fastify:

```bash
npm run docs:api
npm run docs:api:check
```

`docs/architecture/api-reference.md` é gerada e não deve ser editada manualmente.

Esse check é obrigatório pelo processo para mudanças de API, mas não é hoje um step separado do workflow CI.

## 7. E2E é direcionado

```bash
npm run test:e2e
```

Use em jornadas web críticas ou quando uma mudança de layout/router/API exige navegador real. O Playwright não é hoje um segundo job automático de todo PR.

Se E2E falhar localmente por dependência de browser ausente, trate como problema do ambiente de teste; não altere configuração versionada só para apontar para um binário local específico.

## 8. Branch atrás da `main`

Se o PR estiver atrás, com conflito ou falhando em algo já alterado na base:

```bash
git fetch origin main
git rebase origin/main
```

Depois rode novamente:

```bash
npm run check
```

Se o rebase reescrever a branch do próprio PR:

```bash
git push --force-with-lease
```

Nunca force-push em `main`.

## 9. `package-lock.json`

`npm install` local pode gerar ruído dependendo da versão de npm/Node. Antes de commitar:

```bash
git diff -- package-lock.json
```

Se dependências não mudaram de propósito, não inclua rewrite incidental do lockfile.

## 10. Depois do push

Confirme no **head atual** do PR:

- job `Validate` existe;
- `Quality gate` terminou em `success`;
- o SHA validado é o mesmo que será revisado/mergeado;
- a branch não ficou atrás da `main` quando o ruleset exigir status estrito.

Um run verde de SHA anterior não valida commits posteriores.

## Checks adicionais por risco

Além de `npm run check`, use quando aplicável:

```bash
npm run typecheck
npm run test:cli
npm run test:e2e
npm run test:coverage
npm run docs:api:check
```

Coverage é diagnóstico, não threshold global.

## Checklist rápido

- [ ] Li o log do `Validate` até a primeira falha concreta.
- [ ] Reproduzi o subcomando que falhou.
- [ ] Corrigi a causa raiz.
- [ ] `npm run check` passa no head final.
- [ ] Checks direcionados aplicáveis também passam.
- [ ] `package-lock.json` não contém ruído não relacionado.
- [ ] PR está sincronizado com a base quando necessário.
- [ ] O `Validate` verde pertence ao SHA final.

A fonte de verdade do gate obrigatório é `npm run check`; se esse contrato mudar, atualize `package.json`, CI e documentação na mesma entrega.
