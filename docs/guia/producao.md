# Produção

A aba **Produção** aparece quando o projeto possui um `Production Contract v1` válido. Ela mostra o estado real do ambiente e, quando o contrato permite, prepara e executa deployments com confirmação explícita.

O próprio Dev Dashboard também usa essa superfície por meio de um contrato habilitado `strategy=self-update`.

## O que olhar primeiro

No topo da superfície, confira:

- provider e estratégia;
- branch de produção;
- revision local/origin/produção quando conhecidas;
- drift;
- health/readiness declarado;
- disponibilidade do provider externo ou do self-update agent.

`READY` da Vercel não substitui a verificação funcional da aplicação. O fluxo só termina com sucesso depois de `prod:verify` quando essa etapa faz parte do plano.

## Atualizar pendentes no workspace

Na visão global **Produção**, o botão **Atualizar pendentes** prepara os projetos atualmente marcados como pendentes (`drift`). Ele não inicia deployments imediatamente.

Primeiro, o Dev Dashboard calcula todos os planos elegíveis e mostra um preview único com:

- ordem de execução;
- projeto e provider;
- branch e revision exata;
- etapas previstas;
- projetos ignorados porque não conseguiram gerar um plano válido.

Revise esse conjunto antes de confirmar.

O lote usa o mesmo domínio de deployment dos projetos individuais. Estratégias que exigem fluxo dedicado ou não são elegíveis ao lote permanecem fora dele; o `self-update` do próprio Dashboard não deve ser tratado como um `provider-deploy` comum.

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

O Dev Dashboard não precisa conhecer os comandos internos de systemd ou Docker Compose do projeto alvo.

Quando a revision conhecida em `origin/<branch>` é diferente da revision da última promoção local concluída, o topo da aba mostra **Produção está em revision diferente** com o status **Desatualizada**. O último deployment pode continuar aparecendo como concluído na timeline e no histórico, porque esse resultado é histórico; o banner principal representa o estado atual de alinhamento com `origin`.

A comparação usa a ref remota já conhecida pelo workspace Git e não executa `git fetch` só para abrir a tela. Se uma das revisions não estiver disponível, o Dev Dashboard não inventa um estado de drift.

## Projetos Vercel `strategy=git-managed`

O fluxo não usa `prod:deploy` local. A promoção aparece como `provider-deploy`:

```text
check → migrate? → provider-deploy → verify
```

Antes de criar o deployment, o backend confirma que a revision planejada ainda corresponde à branch de produção no `origin`. A Vercel recebe o SHA exato confirmado.

Se `origin/main` avançou depois do preview, a execução é recusada e você precisa preparar novamente.

## Configurar integração Vercel

Se aparecer **Integração Vercel não configurada**, configure o processo local do Dev Dashboard, não o projeto alvo.

Na raiz do Dev Dashboard:

```bash
cp .env.example .env.local
```

Depois preencha `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional, somente quando o escopo do time exigir:
VERCEL_TEAM_ID=team_...
```

Em desenvolvimento, reinicie `npm run dev`. Na instalação permanente, `dev-dashboard.service` lê `.env.local`; execute `npm run local:install` novamente para recompilar/reiniciar e comprovar health.

Não coloque o token em `.dev-dashboard/production.json`, issue, PR, screenshot ou log.

## Self-production do Dev Dashboard

O próprio Dashboard possui contrato ativo:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

O plano é fechado:

```text
check → self-update
```

Antes de usar a aba Produção para atualizar o próprio Dashboard, confirme:

```bash
npm run check
npm run prod:status
npm run prod:check
```

O self-update:

1. resolve `origin/main` no backend;
2. mostra a revision/plano;
3. cria confirmação vinculada ao `planHash`;
4. transfere ownership para o self-update agent externo;
5. encerra a API antiga somente depois de provar o worker;
6. aplica apenas fast-forward da revision confirmada;
7. reinicia o runtime;
8. exige `/api/health` + `x-dev-dashboard-revision` corretos;
9. reconcilia para `succeeded`, `failed` ou `recovery_required`.

Não existe `prod:deploy` para o próprio Dashboard e os scripts `self-update:*` não substituem o fluxo autorizado da UI.

### Instalação local gerenciada

Quando o Dashboard foi instalado por:

```bash
npm run local:install
```

o caminho esperado depois do fast-forward é devolver o runtime à unit fixa:

```text
systemctl --user restart dev-dashboard.service
```

O browser não escolhe a unit.

### Limitação conhecida do redeploy — #659

Em 2026-09-06 há um bug confirmado no handoff do self-update gerenciado: a API antiga pode encerrar e o runtime não voltar sozinho para `dev-dashboard.service`.

Sintoma:

```text
Self-update em execução
→ API cai
→ navegador mostra ERR_CONNECTION_REFUSED
→ serviço só volta após restart manual
```

Enquanto #659 estiver aberto, evite repetir redeploy em sequência.

Para recuperação operacional:

```bash
systemctl --user restart dev-dashboard.service
npm run local:status
curl -i http://127.0.0.1:4343/api/health
```

O health voltar prova que o runtime foi recuperado; não inventa sucesso para um handoff que ficou incompleto. Revise o estado do deployment/self-update antes de tentar novamente.

## Durante o deployment

A timeline mostra a etapa atual e o log real da execução. Em Vercel, `provider-deploy` acompanha estados como queued/building/ready. No self-update, a UI pode perder temporariamente a API enquanto o runtime reinicia e deve reconciliar quando a nova API volta.

Não reinicie deliberadamente o Dev Dashboard durante uma etapa irreversível, exceto quando estiver seguindo um procedimento explícito de recuperação de uma falha já diagnosticada.

## Cancelar

O botão de cancelamento aparece somente quando o domínio ainda permite cancelamento.

Em etapas locais, o processo é sinalizado de forma controlada. Na etapa Vercel, o dashboard interrompe o acompanhamento e tenta cancelar o deployment remoto quando isso ainda é suportado pelo provider.

Depois que o self-update transferiu ownership para o worker externo e iniciou o handoff, não existe cancelamento simples pela API antiga.

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
- revision aplicada;
- política de rollback do projeto;
- handoff do self-update quando for o próprio Dashboard.

Só prepare novo deployment depois de entender o que já foi aplicado.

## Mais detalhes

- [Interface de Produção](../production-ui.md)
- [Operação de deployments](../deployment-operations.md)
- [Production Contract v1](../architecture/production-contract.md)
- [Domínio de deployment](../architecture/deployment-domain.md)
- [Self-production do Dev Dashboard](../architecture/self-production.md)
- [Instalação local](../local-installation.md)
