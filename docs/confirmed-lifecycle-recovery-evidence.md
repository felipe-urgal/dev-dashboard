# Revisão auditável de recuperação — #1116

Esta entrega dá continuidade ao diagnóstico somente leitura do PR #1132 e ao journal de Jobs do PR #1131. **Não finaliza a recuperação, não libera locks e não habilita Start/Stop ou replay.**

## Evidências de recovery

`GET /api/projects/:projectId/service-jobs/:jobId/recovery-evidence`

- Valida que o Job pertence ao projeto requisitado antes de acessar evidências do host.
- Reutiliza o relatório de reconciliação (etapas, observação, ownership e readiness) do PR #1132.
- Consulta somente os leases locais que o Dashboard usa: `environment:<project>:<instance>`, `resource:<serviceRef>` e `compose-project:<project>` para recursos Compose.
- Para cada lease informa `absent|present|unverifiable`. Se o marcador `owner.json` for válido, sonda apenas se o PID existe com sinal 0, sem encerrar o processo: `alive|not-observed|unknown`.
- Sem metadados válidos, diretórios confiáveis, leitura disponível ou observação completa, o resultado continua incerto; nenhuma chave é excluída ou modificada.
- `otherInstancesExcluded: false`, `safeToRetry: false`, `leaseReleaseAuthorized: false` e `manualReviewRequired: true` são invariantes. A ausência de lock ou PID no host atual **não exclui** outro processo, namespace, host, estado compartilhado diferente ou operação externa.

## Registro de revisão no Activity

`POST /api/projects/:projectId/service-jobs/:jobId/recovery-review`

- É a única mutação desta entrega: acrescenta um evento de **auditoria de consulta**, com status `warning`, tipo `compose.lifecycle-recovery-reviewed`, identificador de Job e mensagem fixa sem diagnóstico sensível.
- Revalida que o Job pertence ao projeto e coleta as evidências antes de registrar a revisão. Se a escrita de Activity falhar, não retorna sucesso.
- A resposta registra apenas `recorded: true`; `safeToRetry` e `leaseReleaseAuthorized` permanecem `false`.
- **Não** encerra/atualiza o Journal, não limpa leases órfãos, não cancela comandos e não dispara novas operações.
- A autenticação local existente protege o endpoint. Como o Dashboard não tem identidade individual de operador por usuário, o evento comprova apenas o recebimento autenticado da solicitação de revisão, **não a identidade civil nem que a pessoa concluiu a reconciliação**.

## Condições para futura finalização

Uma eventual API de finalização deve ter autorização distinta, auditoria durável e confirmação explícita, além de verificar instâncias API remanescentes, PID *com identidade do processo* (não apenas existência), fencing contra executores anteriores, leases, ownership, dependências compartilhadas e estados observados novamente no instante da ação. Se qualquer condição não for comprovada, a operação deve falhar fechada e preservar o Job/lock.

Apenas possuir um relatório `matches-target` ou um evento de revisão **não é permissão** para alterar recursos.

## Testes

Os testes exercitam lease ativo com PID observado/não observado, diretório ausente, owner.json corrompido, symlink, falha de inspeção, isolamento por projeto, autenticação HTTP, evento de Activity e ausência de qualquer autorização de replay.
