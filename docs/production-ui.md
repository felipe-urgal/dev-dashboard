# Interface de Produção

A superfície **Produção** concentra o estado e a operação de projetos com `capability=production` válida. Existe uma visão global do workspace com overview e atualização segura de pendentes, além da superfície detalhada por projeto; ambas usam o mesmo domínio de deployment, sem criar um fluxo paralelo no frontend.

## Visão global do workspace

A navegação principal possui a rota `/production`. Ela lê o workspace ativo por
`GET /api/workspaces/:workspaceId/production/overview` e apresenta uma tabela compacta com:

- projeto, provider e branch de produção;
- revision conhecida em produção;
- revision alvo conhecida;
- evidência do último `verify` aplicável à revision em produção;
- estado agregado: `in-sync`, `drift`, `running`, `failed`, `recovery-required`, `not-configured`, `blocked` ou `unknown`.

A consulta usa o scan de projetos já conhecido pelo `ProjectStore`; abrir ou atualizar essa tela não dispara novo scan, não faz `git fetch` e não inicia deployment. As leituras por projeto são limitadas em concorrência e uma falha isolada vira `unknown` naquele item, sem derrubar a visão inteira.

Ao trocar de workspace enquanto essa tela está aberta, o snapshot anterior é descartado. A UI aguarda o scan iniciado pelo fluxo normal de troca de workspace terminar e então consulta novamente o overview; ela não mantém um falso estado vazio entre a seleção e a conclusão do scan.

Para `strategy=command`, a revision alvo é a branch de produção local conhecida e a revision de produção vem da última execução cuja etapa mutável de deploy terminou. Histórico só é usado como evidência quando `deployment.branch` e `deployment.provider` ainda correspondem ao contrato de produção atual; execuções de contratos anteriores não podem declarar `in-sync`, health ou estado operacional para o contrato novo. Para `strategy=git-managed` + Vercel, origin/revision e estado do provider vêm do mesmo `ProductionDeploymentStatusService` usado na tela do projeto, e a evidência local de execução/verify obedece à mesma restrição de branch/provider atual.

A coluna **Health** não representa monitoramento contínuo. `Verify passou` ou `Verify falhou` significa que existe uma execução registrada para a mesma revision atualmente identificada em produção e que a etapa `verify` terminou nesse estado. Sem essa evidência, a tela mostra `Não verificado`, mesmo que a Vercel esteja `READY`.

O botão **Atualizar** nessa visão apenas renova o snapshot de leitura. Já **Atualizar pendentes** prepara uma operação em lote somente para itens atualmente classificados como `drift` e com estratégia operacional. Projetos `strategy=disabled` não entram no lote; isso mantém o self-update do próprio Dev Dashboard fora da operação enquanto o contrato continuar fail-closed.

### Atualizar pendentes

O lote não possui um segundo motor de deployment nem um endpoint mutável próprio. A UI orquestra as mesmas operações já usadas na superfície detalhada e o `DeploymentService` continua sendo a autoridade para plano, confirmação, revalidação e execução.

Antes da primeira mutação, a UI tenta gerar o `DeploymentPlan` de **todos** os projetos pendentes elegíveis. O preview mostra, na ordem do overview:

- projeto;
- provider;
- branch;
- revision exata do plano;
- etapas do plano;
- projetos que não puderam produzir um plano válido, marcados como ignorados com o motivo retornado.

Nenhuma `DeploymentConfirmation` é criada enquanto esse preview não estiver visível e a pessoa não confirmar explicitamente o lote.

Depois de **Confirmar e atualizar N**, a execução é sequencial por padrão:

```text
plan A + plan B + plan C já conhecidos
            ↓
confirm A → start A → aguardar terminal
            ↓ sucesso
confirm B → start B → aguardar terminal
            ↓ sucesso
confirm C → start C → aguardar terminal
```

A confirmação é criada **just-in-time** para cada projeto. O `start` continua recebendo `planHash` e token vinculados, e o backend revalida branch/revision/plano antes de iniciar a mutação real. Assim, um plano que ficou stale enquanto aguardava sua vez falha fechado em vez de executar com contexto antigo.

O lote para na primeira falha de start/acompanhamento ou no primeiro deployment terminal `failed`, `cancelled` ou `recovery_required`. Projetos seguintes ficam explicitamente como **Não iniciado**; os anteriores preservam seu resultado real. Não existe rollback automático do lote nem tentativa implícita de continuar depois de uma falha parcial.

Se a pessoa trocar de workspace ou sair da superfície durante a orquestração, o frontend aborta o acompanhamento e não inicia os projetos seguintes. Um deployment que já tenha sido aceito pelo backend continua pertencendo ao domínio de deployment e deve ser acompanhado pela superfície detalhada/histórico; abortar a request do browser não equivale a cancelar a mutação já iniciada.

Cada linha do overview abre a rota existente `/projects/:projectId/production` para inspeção, planejamento, logs e recuperação do projeto.

## Quando a aba do projeto aparece

A aba aparece quando o discovery reconhece um `Production Contract v1` válido.

- manifesto ausente/inválido: nenhuma capability falsa é criada;
- `strategy=disabled`: a superfície pode explicar o bloqueio, mas não oferece deploy;
- `strategy=command`: oferece planejamento/execução dos scripts canônicos;
- `strategy=git-managed` + Vercel: oferece planejamento/execução com etapa externa `provider-deploy`.

A rota acessada diretamente continua fail-closed quando o projeto não possui contrato operacional válido.

## Sinais exibidos

A tela separa sinais que não são equivalentes:

- **revision local**: SHA do checkout usado para planejar;
- **origin/<branch>**: revision remota conhecida pelo status Git/provider;
- **produção**: revision informada pela Vercel ou última execução local conhecida;
- **provider**: disponibilidade/estado do runtime externo;
- **drift**: comparação de SHA quando as duas revisions são conhecidas;
- **health/verify**: resultado da verificação funcional declarada pelo projeto.

`READY` da Vercel significa que a etapa do provider terminou; não substitui `prod:verify`.

## Fluxo de planejamento e confirmação

As duas estratégias usam o mesmo preview:

```text
Preparar deployment
        ↓
DeploymentPlan
        ↓
revisar projeto + provider + branch + revision + etapas
        ↓
Confirmar e iniciar deployment
        ↓
confirmationToken vinculado ao planHash
        ↓
execução
        ↓
timeline + log
```

**Preparar deployment** não executa mutação. A confirmação só é criada depois que o plano está visível.

Mudança de branch, working tree, revision ou plano entre preview e start é recusada pelo backend.

## `strategy=command`

A timeline pode conter:

```text
check → backup → migrate → deploy → verify
```

conforme as políticas do projeto.

A UI não conhece `systemctl` ou `docker compose`; ela mostra apenas as etapas do contrato e o resultado real do domínio.

Quando `origin/<branch>` e a revision da última promoção local são conhecidas, a tela também compara os dois SHAs. Se eles divergem, o banner principal mostra **Produção está em revision diferente** / **Desatualizada**, mesmo que o último deployment registrado tenha terminado com sucesso. O resultado histórico continua visível na timeline e no histórico; estados ativos, falha, cancelamento e `recovery_required` continuam tendo prioridade sobre o drift.

### Banco do ambiente de check indisponível

Quando o backend classifica um `P1001` do Prisma ocorrido em `prod:check` como `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE`, o banner principal mostra **Banco de check indisponível** e a orientação sanitizada persistida pelo domínio. A timeline continua mostrando `check` como falha e o log preserva o diagnóstico gerado pelo Dev Dashboard.

A interface não oferece botão para iniciar banco, Docker ou Compose. Depois que a dependência for corrigida pelo projeto/ambiente responsável, a pessoa pode preparar um novo deployment normalmente. Outros erros de `prod:check` continuam usando o estado de falha genérico.

## `strategy=git-managed` + Vercel

A timeline usa uma etapa própria:

```text
check → migrate? → provider-deploy → verify
```

Não existe `prod:deploy` artificial.

Ao confirmar, o backend:

1. revalida o plano;
2. antes da promoção, confirma a revision diretamente em `origin/<production.branch>`;
3. resolve a origem GitHub e o projeto Vercel sem aceitar esses valores do browser;
4. cria o deployment de `target=production` para o SHA exato confirmado;
5. acompanha o deployment até estado terminal;
6. executa `prod:verify` quando o provider conclui.

A UI mostra `queued/building/ready/error/canceled` por meio da timeline normalizada e mantém o log da operação no mesmo histórico do deployment.

## Configuração Vercel ausente

Quando `VERCEL_TOKEN` não está disponível no processo da API, a tela mostra integração não configurada e orienta a configuração local.

A correção é feita no Dev Dashboard, por exemplo em `.env.local`:

```dotenv
VERCEL_TOKEN=...
# opcional quando necessário para time:
VERCEL_TEAM_ID=team_...
```

Depois, reinicie `npm run dev`.

A interface nunca pede, exibe ou persiste o token.

## Provider disponível, projeto/revision inválidos

Erros externos são apresentados por categoria, sem corpo bruto da Vercel:

- token/escopo recusado;
- cota/rate limit;
- projeto externo ausente;
- provider indisponível;
- resposta inválida.

Se a revision de `origin` não puder ser provada ou tiver mudado, a execução é recusada antes da promoção e a pessoa precisa preparar novo plano após revisar o Git.

## Acompanhamento e concorrência

Enquanto existe deployment ativo, a tela acompanha detalhe e log. O polling para quando o estado chega a:

- `succeeded`;
- `failed`;
- `cancelled`;
- `recovery_required`.

O viewer do log remove sequências ANSI de terminal antes de renderizar a saída, evitando que códigos de cor/formatação apareçam como texto. Durante uma execução ativa, ele acompanha automaticamente o final conforme novas linhas chegam. Se a pessoa subir manualmente para ler uma parte anterior, o auto-follow pausa; **Voltar ao final** retoma o acompanhamento. Esse comportamento pertence ao componente declarativo do log e não usa enhancer global de DOM.

Existe um único deployment mutável globalmente. A UI detalhada desabilita ações concorrentes compatíveis com essa regra e o lote global espera o projeto atual chegar a estado terminal antes de criar a confirmação/iniciar o próximo. Não há loading artificial quando não existe trabalho real.

## Cancelamento

O cancelamento aparece durante execução ativa.

- etapa local: o domínio sinaliza o processo controlado;
- `provider-deploy`: o polling local é interrompido e o adapter tenta cancelamento remoto best-effort quando o deployment Vercel ainda permite.

Se uma etapa irreversível já iniciou, o resultado pode ser `recovery_required`.

## Verify falhou após a promoção

Quando a promoção concluiu e apenas o `verify` final falhou, a tela pode mostrar:

```text
Deploy concluído · verificação falhou
```

Nesse caso, quando o backend comprova que o retry é seguro, aparece **Verificar novamente**.

O botão repete somente `prod:verify`. Ele nunca repete migration, deploy local ou `provider-deploy` Vercel.

Se branch/revision/contrato ficaram stale, o retry é recusado e a UI volta a orientar um novo plano.

## `recovery_required`

A tela não apresenta rollback automático como solução genérica. Ela orienta revisar:

- etapa irreversível;
- timeline/log;
- estado real do provider/aplicação;
- schema/backup;
- política de rollback do projeto.

## Status externo e drift

Fora de uma execução mutável, projetos `strategy=command` com revisions conhecidas comparam a ref `origin/<branch>` já disponível no workspace Git com a revision da última promoção local registrada. Projetos `strategy=git-managed` consultam o snapshot Vercel para mostrar provider, revision de produção e drift.

Essas leituras de status não fazem `git fetch`. Por isso ausência de uma ref local pode produzir drift desconhecido. A validação de segurança antes de um novo `provider-deploy` é mais forte: ela consulta o `origin` diretamente e exige igualdade com a revision confirmada.

## Troca de projeto

Requests canceláveis usam `AbortController` e a tela descarta respostas obsoletas por geração/latest-wins. Ao trocar de projeto:

1. invalida a geração anterior;
2. aborta requests pendentes;
3. cancela timers;
4. descarta respostas tardias.

Estado do projeto anterior não pode sobrescrever a nova tela.

## Acessibilidade e responsividade

- preview recebe foco depois de ser criado;
- botões nativos preservam teclado e `disabled`;
- erros usam semântica de alerta;
- loading usa semântica de status;
- layout colapsa em telas estreitas;
- spinners respeitam `prefers-reduced-motion`.

## Testes

A cobertura da superfície inclui estados fail-closed, preview/confirmação, respostas stale, provider Vercel, timeline/log, retry de verify, agregação do workspace, troca de workspace após scan, geração de todos os planos antes da primeira confirmação, execução sequencial/parada do lote e regressões do fluxo `command`, incluindo drift entre `origin/<branch>` e a última revision promovida. Falhas tipadas de banco indisponível em `prod:check` também possuem regressão para garantir que a mensagem sanitizada apareça no estado principal sem substituir os demais erros genéricos.

Guia de uso: [guia/producao.md](guia/producao.md). Operação detalhada: [deployment-operations.md](deployment-operations.md).
