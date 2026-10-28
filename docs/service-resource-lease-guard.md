# Guard de ownership para mutações Compose — #1116

Esta etapa reforça o `ServiceResourceOperationLock` compartilhado pelas rotas Docker Compose. O callback protegido recebe um `ServiceResourceLeaseGuard` capaz de verificar a titularidade do conjunto de locks já adquirido.

## Protocolo cooperante

1. A operação adquire todos os diretórios de lease na ordem canônica, usando `mkdir` exclusivo, e grava `owner.json` contendo `key` e `holder` aleatório da operação.
2. Antes de entrar no callback, o lock confere que cada diretório/arquivo ainda está presente, com tipo esperado e que os marcadores continuam com o mesmo `holder` e recurso físico.
3. O owner `DockerComposeLifecycleService` passa o guard pela cadeia de Start, Stop e Restart. Depois de consultar provider/ownership/preflight, e **antes de chamar o runner de comandos Compose**, ele exige `guard.assertOwned()`. Se a evidência estiver ausente, trocada, corrompida, inacessível ou for um symlink, a mutação falha fechada sem enviar novo comando.
4. O `finally` não remove um marcador cujo `holder` ou `key` não corresponda à aquisição original. Leases alheios e inconsistentes ficam intactos para reconciliação.

O construtor sem `stateDirectory` continua usando o lock em memória para testes/consumidores antigos. Na composição padrão da API, o Compose usa um diretório de estado local (PR #1130). Os locks continuam **sem roubo ou expiração automática**.

## Limitação de fencing

Esta é uma **verificação cooperante de ownership antes do dispatch**, e não um fencing distribuído completo. Existe uma janela entre o último `assertOwned()` e a entrega do comando ao Docker, e um comando já enviado pode continuar rodando mesmo se o lease mudar. Um operador não deve remover ou substituir um lease ativo: isso não cancela a execução anterior.

Um sistema de fencing efetivo deverá assegurar que todos os executores relevantes participem do mesmo protocolo e que o provider rejeite comandos com gerações anteriores, ou garantir quiescência verificada do executor anterior antes de avançar a geração. O Docker Compose CLI atual não interpreta os tokens do Dashboard. Multi-host, ferramentas externas, Process Manager e recuperação que limpa leases continuam fora desta garantia.

O journal e os endpoints de recuperação não são alterados nesta etapa. Eles continuam com `safeToRetry:false`, `leaseReleaseAuthorized:false` e sem retomada automática. Não se cria uma rota mutável de Start/Stop nesta entrega.

## Testes

- Guard aceita ownership correto e rejeita uso depois de liberar.
- Substituição de `owner.json` durante uma operação invalida o guard, impede novos callbacks e preserva o marcador diferente.
- Aquisição incompleta impede callback; recursos independentes continuam disponíveis.
- Start, Stop e Restart do owner Compose não chamam o runner se o guard acusa perda do lease após o preflight.
