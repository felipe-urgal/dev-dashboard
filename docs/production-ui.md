# Interface de Produção

A superfície **Produção** concentra o estado operacional de um projeto que possui `capability=production` válida. Ela não cria um dashboard paralelo: fica dentro do detalhe do projeto e usa o mesmo domínio de deployment documentado em [Domínio de deployment](architecture/deployment-domain.md).

## Quando a aba aparece

A aba `Produção` aparece somente quando o projeto possui a capability `production` adicionada pelo discovery de um Production Contract v1 válido.

Projetos sem contrato ou com manifesto inválido não recebem botão/aba de produção. Se a rota `/projects/:projectId/production` for acessada diretamente, a tela permanece fail-closed e explica `Produção não configurada` ou o warning de contrato sem liberar ações.

Contratos válidos com `strategy=disabled` podem abrir a superfície porque possuem capability conhecida, mas a interface mostra o bloqueio declarado e não oferece execução.

## Sinais exibidos

A tela separa sinais que não são equivalentes:

- **revision local**: último commit conhecido pelo overview Git do projeto;
- **origin/<branch>**: para Vercel, a ref remota já conhecida pelo adapter; para `command`, a branch remota retornada pelo workspace Git quando disponível;
- **produção**: revision informada pelo provider Vercel ou, em `command`, a última execução `succeeded` registrada pelo domínio;
- **readiness**: estado do provider Vercel ou resultado do último `prod:verify` conhecido;
- **health**: existência do health HTTP declarado no contrato e, quando aplicável, contexto do último verify.

A interface não afirma health atual quando o backend não executou uma verificação atual. `READY` da Vercel continua sendo readiness do provider, não prova única de saúde da aplicação.

## Fluxo `strategy=command`

A UI mantém a fronteira de confirmação do backend:

```text
Preparar deployment
        ↓
DeploymentPlan
        ↓
revisar projeto + branch + revision + etapas + impacto
        ↓
Confirmar e iniciar deployment
        ↓
confirmationToken vinculado ao planHash
        ↓
start
        ↓
timeline + log limitado
```

O botão **Preparar deployment** apenas solicita o plano; nenhuma confirmação é criada nessa etapa. A confirmação só é pedida depois que o plano está visível e o usuário escolhe **Confirmar e iniciar deployment**.

Etapas mutáveis e irreversíveis recebem marcação explícita. Mudança de branch, working tree, revision ou hash depois do preview continua sendo recusada pelo backend.

Enquanto uma execução está ativa, a tela acompanha o deployment e o log. O polling para quando o estado chega a `succeeded`, `failed`, `cancelled` ou `recovery_required`.

### Cancelamento e recuperação

Cancelamento só aparece durante uma execução ativa. O resultado final continua pertencendo ao domínio:

- antes de mudança irreversível: pode terminar `cancelled`;
- durante/depois de mudança irreversível: pode terminar `recovery_required`.

Quando o estado é `recovery_required`, a UI destaca que rollback automático não é seguro e orienta a revisar timeline, log, schema, backup e a política do projeto antes de repetir a operação.

## Fluxo `strategy=git-managed`

Para Vercel, a superfície é somente leitura nesta fase. Ela consulta `GET /api/projects/:projectId/deployments/status` e mostra:

- disponibilidade do provider;
- projeto externo mapeado;
- deployment de produção atual;
- URL, state, branch e revision quando fornecidos;
- drift entre origin e produção;
- timeline normalizada do provider;
- operações locais declaradas (`prod:check`, `prod:migrate`, `prod:verify`) apenas como capabilities informativas.

A tela não dispara `git push`, `vercel --prod`, migration, verify ou rollback remoto. Quando o deployment externo está `queued` ou `building`, o snapshot é atualizado enquanto existe trabalho real no provider.

## Estados visuais

A superfície representa explicitamente:

- produção não configurada;
- contrato inválido;
- produção bloqueada pelo contrato;
- pronta para planejar;
- atualizada/alinhada;
- revision diferente;
- deployment em execução;
- falha antes de recuperação obrigatória;
- `recovery_required`;
- cancelamento;
- provider externo não configurado, sem autenticação, limitado por cota, indisponível ou com resposta inválida;
- estado parcial quando não há revision/sinal suficiente para uma conclusão forte.

Loading visual só aparece enquanto uma requisição real está em andamento. Estado de execução possui semântica própria e não reutiliza loading artificial.

## Troca de projeto e concorrência de requests

Requests da superfície usam `AbortController` quando possível e uma geração monotônica (`latest-wins`). Ao trocar de projeto:

1. a geração anterior é invalidada;
2. requests pendentes são abortados;
3. timers de polling são cancelados;
4. respostas antigas são descartadas mesmo que algum transporte não consiga ser interrompido a tempo.

Isso impede o estado de produção do projeto anterior de sobrescrever a tela atual.

## Acessibilidade e responsividade

- o preview recebe foco programático depois de ser gerado;
- botões nativos preservam teclado e estados `disabled` durante operações concorrentes;
- erros usam `role=alert` e carregamento inicial usa `role=status`;
- o layout de revisions e plano colapsa para uma coluna em telas estreitas;
- animação de spinner é removida com `prefers-reduced-motion: reduce`.

## Testes

A entrega possui testes de componente para estados fail-closed, preview/confirmação, stale response e Vercel, além de smoke E2E do fluxo `command` usando uma fixture Git real com Production Contract válido.
