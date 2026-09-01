# Retry seguro da etapa `verify`

## Contexto

Um deployment pode concluir todas as mutações e falhar apenas na validação final. Isso vale tanto para:

- `strategy=command`, depois de `prod:deploy`;
- `strategy=git-managed`/Vercel, depois de `provider-deploy`.

Exemplo comum: serviço/provider conclui a promoção, mas a aplicação ainda não está pronta no primeiro instante em que `prod:verify` roda.

Repetir o plano inteiro seria mais amplo e potencialmente perigoso: backup, migration e promoção já podem ter produzido efeito. Por isso o Dev Dashboard oferece uma ação estrita que repete somente a etapa final de verificação quando consegue **provar** que isso é seguro.

## Princípio

`retryVerify` não é um novo deployment e não é um atalho para ignorar recovery.

Ele só existe quando a timeline persistida e o estado atual provam que:

```text
mutações anteriores concluíram
+ verify final falhou/cancelou
+ contexto Git/contrato ainda corresponde
+ execução ainda é a referência mais recente
= pode repetir somente verify
```

Se qualquer parte não puder ser provada, o backend falha fechado com `DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE` ou erro de stale/revision apropriado e não executa comando algum.

## Elegibilidade

A validação exige, entre outras invariantes:

- a execução terminou em um estado compatível com retry (`recovery_required` ou outro estado terminal seguro reconhecido pelo domínio);
- `verify` é a última etapa da timeline;
- `verify` é somente leitura (`mutating=false`, `irreversible=false`);
- `verify` terminou como `failed` ou `cancelled`;
- todas as etapas anteriores terminaram como `succeeded`;
- a etapa de promoção correspondente terminou como `succeeded`:
  - `deploy` para `strategy=command`, ou
  - `provider-deploy` para `strategy=git-managed`;
- branch e revision atuais continuam compatíveis com o snapshot original;
- o Production Contract atual continua permitindo a mesma estratégia/verify;
- a execução ainda não foi superada por um deployment mais recente do projeto;
- não existe outro deployment mutável incompatível em andamento.

O backend não confia apenas no texto exibido pela UI para decidir elegibilidade.

## Execução

A rota:

```text
POST /api/projects/:projectId/deployments/:deploymentId/verify
```

reutiliza a etapa `verify` persistida na execução original.

Durante o retry:

1. o deployment volta temporariamente a `verifying`;
2. o serviço revalida o contexto necessário;
3. executa **somente** o adapter da etapa `verify`;
4. anexa o output mascarado ao log existente;
5. registra o novo `exitCode`/horários na mesma timeline;
6. sucesso transforma a execução em `succeeded` e limpa o diagnóstico anterior;
7. nova falha mantém o estado de falha/recovery apropriado sem repetir mutação.

## O que nunca é repetido

O retry não executa novamente:

```text
check
backup
migrate
deploy
provider-deploy
```

Em Vercel, isso significa que uma falha de readiness depois de um deployment `READY` **não cria outro deployment Vercel**.

## `strategy=command`

Exemplo:

```text
check ✓
backup ✓
deploy ✓
verify ✗
```

Se o snapshot continuar válido, `Verificar novamente` executa apenas `prod:verify`.

Se o `verify` local exigir privilégio e falhar por sudo, a autorização temporária pode continuar disponível para o retry; a senha não é encaminhada a etapas anteriores nem causa novo deploy.

## `strategy=git-managed` + Vercel

Exemplo:

```text
check ✓
migrate ✓
provider-deploy ✓   # Vercel READY para o SHA confirmado
verify ✗
```

O retry não precisa reabrir a promoção nem criar outro deployment. Ele repete somente `prod:verify` no projeto alvo.

A prova de `origin/<branch>` usada para **autorizar a promoção original** não é transformada em justificativa para uma nova promoção, porque nenhuma nova mutação de provider acontece no retry. Ainda assim, branch/revision/contrato atuais precisam satisfazer as revalidações do domínio para evitar executar um verify historicamente obsoleto como se pertencesse ao estado atual.

## Execução antiga superada

Um deployment histórico não pode voltar a ser “o atual” apenas porque seu verify era elegível no passado.

Se existe deployment mais recente para o projeto, o retry da execução antiga é recusado. Isso evita validar uma revision anterior e sobrescrever semanticamente o resultado operacional mais novo.

## UI

Quando backend/timeline/snapshot Git indicam elegibilidade, a tela mostra:

```text
Deploy concluído · verificação falhou
```

com a ação **Verificar novamente**.

Nesse estado, a UI evita incentivar um deployment completo quando o caminho estreito é suficiente.

Se branch, HEAD, contrato ou histórico ficarem stale, o retry deixa de ser oferecido/é recusado e o fluxo volta a exigir preparação de um novo plano.

## Relação com `recovery_required`

`recovery_required` continua sendo o estado conservador quando uma etapa irreversível já iniciou e o dashboard não consegue concluir que a situação é segura automaticamente.

O retry de verify é uma exceção estreita porque a timeline prova que:

- a mutação anterior terminou;
- a única etapa problemática é somente leitura;
- repetir essa etapa não amplia os efeitos já aplicados.

Todos os demais casos continuam mostrando orientação para revisar timeline, provider/aplicação, schema/backup e política de rollback antes de qualquer nova mutação.

## Invariantes de segurança

1. nenhum novo token de confirmação de mutação é criado para o retry;
2. nenhuma etapa mutável é reexecutada;
3. o script usado continua sendo o `prod:verify` canônico reconhecido/persistido;
4. execução antiga superada é recusada;
5. branch/revision/contrato são revalidados;
6. logs continuam limitados e mascarados;
7. uma falha repetida não é convertida artificialmente em sucesso.
