# Retry seguro da etapa `verify`

## Contexto

Um deployment `command` pode concluir todas as mutações e falhar apenas na validação final. Um exemplo real é um serviço systemd que reinicia corretamente, mas ainda não abriu a porta de readiness no primeiro instante em que `prod:verify` roda.

Nesse cenário, repetir o plano inteiro seria desnecessário e potencialmente mais arriscado: `check`, `backup`, migration e `deploy` já produziram os efeitos previstos. O Dev Dashboard mantém a execução como `recovery_required` enquanto a produção não for verificada, mas oferece uma ação mais estreita que recuperação manual ou novo deploy.

## Invariante de elegibilidade

`retryVerify` é permitido somente quando a execução persistida prova simultaneamente que:

- o status é `recovery_required`;
- a etapa `verify` é a última da timeline;
- `verify` é somente leitura (`mutating=false`, `irreversible=false`);
- `verify` terminou como `failed` ou `cancelled`;
- `deploy` terminou como `succeeded`;
- todas as etapas anteriores a `verify` terminaram como `succeeded`;
- branch e revision atuais continuam iguais ao snapshot da execução original;
- não existe outro deployment em execução.

Se qualquer condição não for provada, o backend responde com `DEPLOYMENT_VERIFY_RETRY_NOT_AVAILABLE` e não executa comando algum.

## Execução

A rota `POST /api/projects/:projectId/deployments/:deploymentId/verify` reutiliza a etapa `verify` persistida no deployment original. Ela não reconstrói o plano e não consulta um script novo do `package.json`, evitando ampliar silenciosamente o escopo da execução confirmada.

Durante o retry:

1. a mesma execução volta temporariamente para `verifying`;
2. somente o adapter da etapa `verify` é executado;
3. logs são anexados ao log existente;
4. sucesso transforma a execução em `succeeded` e limpa o diagnóstico anterior;
5. nova falha mantém `recovery_required`;
6. cancelamento não repete nenhuma mutação e continua exigindo validação/decisão antes de qualquer recuperação.

## UI

Quando a timeline satisfaz o estado seguro acima **e** o snapshot Git carregado na tela ainda confirma a mesma branch e revision, a tela mostra `Deploy concluído · verificação falhou` e a ação `Verificar novamente`. A ação de preparar um deployment completo fica escondida nesse estado para evitar que o caminho mais amplo seja escolhido por engano. Se branch ou HEAD mudou, o retry deixa de ser oferecido e a preparação de um novo deployment volta a ficar disponível.

Se a tentativa de `verify` falhou por falta de privilégio, a autorização sudo temporária também fica disponível nesse estado. Depois da autorização, a interface repete somente o `verify`; ela não prepara nem executa novamente as etapas mutantes.

O aviso genérico `Não faça rollback cego` continua sendo exibido para todos os demais estados `recovery_required` em que o dashboard não consegue provar que apenas o verify falhou.
