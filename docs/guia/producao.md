# Produção

A aba **Produção** aparece quando o projeto possui um `Production Contract v1` válido. Ela mostra o estado real do ambiente e, quando o contrato permite, prepara e executa deployments com confirmação explícita.

## O que olhar primeiro

No topo da superfície, confira:

- provider e estratégia;
- branch de produção;
- revision local/origin/produção quando conhecidas;
- drift;
- health/readiness declarado;
- disponibilidade do provider externo.

`READY` da Vercel não substitui a verificação funcional da aplicação. O fluxo só termina com sucesso depois de `prod:verify` quando essa etapa faz parte do plano.

## Atualizar pendentes no workspace

Na visão global **Produção**, o botão **Atualizar pendentes** prepara os projetos atualmente marcados como pendentes (`drift`). Ele não inicia deployments imediatamente.

Primeiro, o Dev Dashboard calcula todos os planos elegíveis e mostra um preview único com:

- ordem de execução;
- projeto e provider;
- branch e revision exata;
- etapas previstas;
- projetos ignorados porque não conseguiram gerar um plano válido.

Revise esse conjunto antes de confirmar. Projetos com `strategy=disabled` não entram no lote; por isso o próprio Dev Dashboard continua fora enquanto o self-update estiver bloqueado por segurança.

Ao clicar em **Confirmar e atualizar N**, os projetos são executados um por vez. A confirmação de cada projeto só é criada quando chega sua vez, e o backend revalida o `planHash`/revision antes de iniciar. Se o contexto mudou desde o preview, a operação daquele projeto falha fechado.

O lote para na primeira falha, cancelamento ou `recovery_required`. Os projetos seguintes aparecem como **Não iniciado**, enquanto os anteriores mantêm o resultado que realmente alcançaram. Abra a produção detalhada do projeto que falhou para revisar timeline, log e possíveis ações de recuperação antes de tentar novamente.

Se você sair da tela ou trocar de workspace durante o lote, os projetos seguintes não são iniciados. Um deployment que já foi aceito pela API continua existindo e deve ser acompanhado na tela detalhada; sair da página não equivale a cancelar uma mutação já em andamento.

## Preparar deployment

Clique em **Preparar deployment**.

Isso apenas gera o preview. Nenhuma migration, restart ou promoção é executada nessa etapa.

Revise:

- projeto;
- branch;
- SHA/revision;
- provider;
- ordem das etapas;
- quais etapas são mutáveis/irreversíveis.

Se o plano estiver correto, use **Confirmar e iniciar deployment**.

A confirmação vale somente para aquele projeto, revision e `planHash`. Se o Git mudar, um novo plano será necessário.

## Projetos `strategy=command`

O fluxo usa scripts `prod:*` do próprio projeto. Dependendo das políticas, a timeline pode ser:

```text
check → backup → deploy → verify
```

ou:

```text
check → backup → migrate → deploy → verify
```

O Dev Dashboard não precisa conhecer os comandos internos de systemd ou Docker Compose.

## Projetos Vercel `strategy=git-managed`

O fluxo não usa `prod:deploy` local. A promoção aparece como `provider-deploy`:

```text
check → migrate? → provider-deploy → verify
```

Antes de criar o deployment, o backend confirma que a revision planejada ainda corresponde à branch de produção no `origin`. A Vercel recebe o SHA exato confirmado.

Se `origin/main` avançou depois do preview, a execução é recusada e você precisa preparar novamente.

## Configurar integração Vercel

Se aparecer **Integração Vercel não configurada**, configure o processo local do Dev Dashboard, não o projeto alvo.

Na raiz do Dev Dashboard, crie a configuração local a partir do template:

```bash
cp .env.example .env.local
```

Depois preencha `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional, somente quando o escopo do time exigir:
VERCEL_TEAM_ID=team_...
```

Depois reinicie:

```bash
npm run dev
```

Não coloque o token em `.dev-dashboard/production.json`, issue, PR ou screenshot.

## Durante o deployment

A timeline mostra a etapa atual e o log real da execução. Em Vercel, `provider-deploy` acompanha estados como queued/building/ready.

Não feche/reinicie o Dev Dashboard deliberadamente durante uma etapa irreversível. Se o coordenador cair depois de migration ou promoção já iniciada, a execução pode voltar como `recovery_required`.

## Cancelar

O botão de cancelamento aparece somente com execução ativa.

Em etapas locais, o processo é sinalizado de forma controlada. Na etapa Vercel, o dashboard interrompe o acompanhamento e tenta cancelar o deployment remoto quando isso ainda é suportado pelo provider.

Se a mutação já começou, cancelamento não garante ausência de efeitos e pode resultar em `recovery_required`.

## Verify falhou, mas o deploy terminou

Quando a promoção terminou e somente a verificação final falhou, a tela pode oferecer **Verificar novamente**.

Use esse botão antes de repetir um deployment completo. Ele executa somente `prod:verify` e não repete migration nem a promoção Vercel.

Se o contexto Git/contrato mudou, o backend não permite o retry e pede um novo plano.

## `recovery_required`

Não faça rollback cego.

Revise a timeline e confirme o estado real de:

- aplicação/provider;
- banco/schema;
- backup/checkpoint;
- política de rollback do projeto.

Só prepare novo deployment depois de entender o que já foi aplicado.

## Produção bloqueada

`strategy=disabled` é um estado válido. A aba explica `reasonCode`/blockers, mas não oferece deploy.

Isso é especialmente importante para o próprio Dev Dashboard. A infraestrutura externa já existe em etapas: #520 entregou handoff persistente e #521 entregou agent instalado/lifecycle/canal autenticado. O PR #523 implementa a base de integração API → agent, aplicação fast-forward e restart user-space.

Mesmo assim, o contrato continua bloqueado. Ainda é necessário provar end-to-end que ownership sobrevive à parada da API, que a nova API passa readiness bounded na **revision confirmada**, que o resultado final permanece recuperável após restart real e que o modelo final de segurança/privilégio é aceitável.

Não use os scripts `self-update:*` como atalho para contornar `strategy=disabled`.

## Mais detalhes

- [Interface de Produção](../production-ui.md)
- [Operação de deployments](../deployment-operations.md)
- [Production Contract v1](../architecture/production-contract.md)
- [Domínio de deployment](../architecture/deployment-domain.md)
- [Self-production do Dev Dashboard](../architecture/self-production.md)
