# Produção

Este é o ponto de entrada canônico para a produção do **próprio Dev Dashboard**.

O projeto usa `strategy=self-update`, `provider=none` e branch `main`. Não existe `prod:deploy` local, provider externo para o próprio Dashboard, `sudo`/`systemctl` ou executor remoto genérico.

Documentação aprofundada:

- [`architecture/self-production.md`](architecture/self-production.md): protocolo completo de handoff, agent, worker, restart, revision e recovery;
- [`architecture/production-contract.md`](architecture/production-contract.md): contrato comum de Produção;
- [`architecture/deployment-domain.md`](architecture/deployment-domain.md): planner, confirmação, estados e recovery;
- [`deployment-operations.md`](deployment-operations.md): operação dos deployments;
- [`production-ui.md`](production-ui.md): experiência na aba Produção;
- [`architecture/security.md`](architecture/security.md): fronteiras de segurança.

## Contrato ativo

`.dev-dashboard/production.json` declara somente:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
commands.status=prod:status
commands.check=prod:check
```

Políticas de backup, migrations e rollback ficam `not-configured` para esta estratégia.

O parser rejeita `deploy`, `migrate`, `backup`, `verify` local ou provider externo para o self-update v1.

## Fluxo canônico

Antes de uma atualização do próprio Dashboard:

```bash
npm run check
npm run prod:status
npm run prod:check
```

Depois, a mutação suportada ocorre pela própria aba **Produção**:

```text
Preparar deployment
-> resolver origin/main
-> revisar revision + plano check -> self-update
-> confirmar planHash
-> executar
-> handoff para agent externo
-> fast-forward da revision confirmada
-> restart
-> readiness + prova da revision
-> succeeded | failed | recovery_required
```

Não existe comando `npm run prod:deploy` para substituir esse fluxo.

## `prod:status`

```bash
npm run prod:status
```

É somente leitura. Mostra se o contrato de self-production está habilitado e se o agent está disponível/pronto.

## `prod:check`

```bash
npm run prod:check
```

É o preflight específico da self-production. Ele valida o contrato fechado e exige que o self-update agent esteja `ready`, com suporte às capacidades necessárias de ownership/inspeção.

`prod:check` é diferente de `npm run check`:

- `npm run check` é o gate normal de engenharia/CI;
- `npm run prod:check` valida a infraestrutura de self-update instalada nesta máquina.

Um não substitui o outro.

## Agent e tooling interno

Os scripts abaixo são tooling de engenharia, não uma segunda interface pública de deploy:

```bash
npm run self-update:helper -- ...
npm run self-update:agent -- ...
```

O fluxo suportado sempre passa pelo Production Contract, planner, confirmação vinculada ao `planHash` e revalidação da revision.

O agent instalado vive fora da checkout, em user-space, e usa canal local autenticado. O catálogo remoto não aceita shell/programa/argv/path arbitrários.

## Aplicação da revision

O worker revalida:

- checkout válida e pertencente ao usuário;
- projeto `dev-dashboard`;
- working tree completamente limpa;
- branch local `main`;
- `origin/main` ainda igual à revision confirmada;
- HEAD ancestral da revision alvo.

A aplicação permitida é somente:

```text
git merge --ff-only <targetRevision>
```

Não existe `reset --hard`, descarte automático de mudanças locais ou checkout forçado.

## Restart e verify da revision

Depois de aplicar a revision, o worker inicia a distribuição compilada usando `scripts/dev-web.mjs` e espera a API voltar.

Sucesso exige duas provas:

1. `/api/health` saudável;
2. header `x-dev-dashboard-revision` exatamente igual à revision alvo.

Uma porta que voltou com código antigo não é considerada sucesso.

## Recovery

Depois que a aplicação da revision começou, incerteza relevante é tratada de forma conservadora.

Casos como falha de fast-forward, runtime que não volta, readiness expirado, revision divergente ou resultado terminal não confiável podem resultar em:

```text
recovery_required
```

Não existe rollback automático cego.

## Produção de projetos gerenciados pelo Dashboard

Este documento trata a produção do **Dev Dashboard em si**. Para entender como ele opera outros projetos:

- `strategy=command`: scripts `prod:*` canônicos do projeto alvo;
- `strategy=git-managed`: provider externo explícito, como Vercel, sem `prod:deploy` artificial;
- `strategy=self-update`: somente o protocolo fechado do próprio Dashboard.

Consulte [`architecture/production-contract.md`](architecture/production-contract.md) e [`guia/producao.md`](guia/producao.md).

## Checklist antes de considerar a atualização concluída

- `npm run check` verde no código que será promovido;
- `prod:status` coerente;
- `prod:check` verde;
- working tree limpa;
- plano aponta para a revision correta de `origin/main`;
- confirmação corresponde ao `planHash` atual;
- resultado final comprova readiness + revision;
- qualquer estado `recovery_required` foi tratado antes de nova tentativa destrutiva.
