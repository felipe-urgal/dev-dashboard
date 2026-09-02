# Segurança do provider Vercel

Esta nota complementa [Segurança e modelo de ameaça](security.md) para o adapter `strategy=git-managed` + `provider=vercel` do domínio de deployment.

A integração suporta **leitura e promoção explícita para produção**. A mutação não transforma a credencial Vercel em uma autorização genérica: ela só ocorre dentro de um `DeploymentPlan` confirmado, vinculado à branch, revision e projeto Vercel alvo, usando a mesma timeline, histórico e recovery do domínio de deployment.

## Fronteira de confiança

O vínculo entre projeto local e Vercel vem exclusivamente de `production.external.project` em um `Production Contract v1` já validado. O backend não usa nome da pasta, repositório, workspace ou usuário autenticado como fallback implícito.

Para uma promoção, `external.project`, branch e SHA entram no próprio plano/hash confirmado. Se o contrato mudar depois do preview, a confirmação anterior deixa de ser válida. O POST para a Vercel usa o SHA exato confirmado; ele não usa uma branch móvel como única prova do código a publicar.

O browser não envia:

- token Vercel;
- team id;
- host da API;
- URL arbitrária de provider;
- headers externos;
- owner/repositório Git arbitráveis;
- branch ou SHA de promoção fora do plano calculado;
- programa, argumentos ou corpo de shell.

## Credenciais

`VERCEL_TOKEN` e, quando necessário, `VERCEL_TEAM_ID` são lidos apenas do ambiente do processo local do Dev Dashboard.

Esses valores:

- não pertencem ao manifesto do projeto;
- não são persistidos pelo domínio de deployment;
- não são retornados pela API local;
- não são incluídos em logs ou mensagens de erro do provider.

## Preflight antes de mutações

Uma promoção `git-managed` é fail-closed. Antes de qualquer migration explícita e novamente imediatamente antes do POST de deployment, o backend valida:

1. o contrato continua `git-managed` + `vercel` e aponta para o mesmo `external.project` confirmado;
2. checkout local continua na branch/revision confirmadas;
3. `git ls-remote origin refs/heads/<branch>` confirma o mesmo SHA no remote real;
4. o remote `origin` resolve para um repositório GitHub reconhecível;
5. a integração Vercel autentica e resolve o projeto confirmado;
6. não existe deployment de produção Vercel em `queued`, `building` ou estado desconhecido que torne uma segunda promoção insegura.

Esse preflight é somente leitura; ele não altera banco, Git ou provider. A primeira mudança irreversível só pode ocorrer depois que essas evidências tiverem sido aceitas para o alvo confirmado.

A consulta remota Git possui timeout e pode ser interrompida pelo cancelamento do deployment. Falha de rede/autenticação/credential helper não cai para uma tracking ref local antiga.

### Idempotência para revision já publicada

Projetos ligados ao Git da Vercel podem ter o mesmo `origin/<branch>` publicado automaticamente antes de o usuário iniciar o fluxo no Dev Dashboard. Nesse caso, o preflight pode comprovar que o deployment de produção mais recente já está `READY` para **a mesma branch e o mesmo SHA** confirmados no plano.

Quando essa prova existe, `provider-deploy` reutiliza o deployment já pronto em vez de criar outro deployment do mesmo commit. A etapa continua registrada na timeline e `prod:verify` continua obrigatório. `prod:migrate`, quando declarado pela política, também continua sendo executado conforme o plano; a idempotência elimina apenas a mutação externa duplicada.

O reaproveitamento é fail-closed: estado `READY` sem branch ou SHA coincidentes não é reutilizado. Deployments `queued`, `building` ou com estado desconhecido continuam bloqueando uma nova promoção. Assim, o Dashboard não transforma semelhança de nome ou apenas uma branch móvel em prova de que a revisão confirmada já está em produção.

Essa regra também evita consumir quota da API Vercel criando um deployment redundante quando a integração Git já publicou exatamente a revisão confirmada.

## Saída para a Vercel

O adapter usa a API HTTPS fixa da Vercel. `external.project` participa como identificador explicitamente confirmado; o ID canônico retornado pelo provider é resolvido no preflight e reutilizado na promoção.

Quando não existe uma revision `READY` idêntica comprovada no preflight, a criação do deployment envia somente os campos necessários:

- projeto Vercel resolvido;
- `target=production`;
- origem GitHub reconhecida pelo backend;
- branch confirmada;
- SHA exato confirmado.

Depois da criação, polling bounded acompanha **esse deployment específico** até estado terminal. `READY` conclui apenas a etapa `provider-deploy`; `prod:verify` permanece separado e decide a validação funcional declarada pelo projeto.

## Cancelamento

Cancelar a execução local interrompe o polling. Quando um deployment remoto já foi criado, o adapter tenta cancelá-lo na Vercel em modo best-effort e com timeout próprio.

Cancelamento remoto não é tratado como transação ou rollback. Se a promoção já pode ter produzido efeito, o domínio preserva a semântica conservadora de `recovery_required` e exige revisão do estado real antes de uma nova tentativa.

## Respostas externas e segredos

Respostas da Vercel possuem timeout, limite de tamanho e validação defensiva de shape. Somente campos necessários ao estado operacional são usados: projeto, deployment de produção, URL, estado e metadados Git de branch/SHA quando presentes.

Bodies e **mensagens brutas** de erro não são repassados ao browser nem persistidos no histórico. Falhas esperadas viram códigos/mensagens locais estáveis `DEPLOYMENT_PROVIDER_*` para configuração ausente, autenticação recusada, quota, projeto ausente, deployment concorrente, indisponibilidade e resposta inválida.

## Git e drift

Decisões de mutação consultam o remote real com `git ls-remote`; não usam a tracking ref local como prova de autorização.

A superfície de status compara a revision remota observável com a revision de produção e classifica apenas `in-sync`, `drift` ou `unknown`. O domínio não deduz `ahead`, `behind` ou ancestralidade sem análise Git específica.

O Dashboard não executa `git push`, não cria commit artificial e não altera a branch para disparar a Vercel. A promoção é feita diretamente pelo adapter com o SHA confirmado quando uma promoção externa ainda é necessária.

## Health, migration e promoção

`READY` da Vercel representa somente o estado reportado pelo provider. Ele não substitui health/readiness do Production Contract.

Quando `migrations=before-deploy`, o plano pode executar `prod:migrate` antes da promoção, mas somente depois do preflight remoto/Vercel passar. Isso evita alterar schema de produção para uma revision que não está publicada ou não pode ser promovida com segurança.

Não existe `prod:deploy` local artificial. `prod:check`, `prod:migrate` e `prod:verify` continuam comandos canônicos do próprio projeto; `provider-deploy` é uma etapa externa tipada do domínio.

Quota externa nunca é contornada com commit artificial ou redisparo automático. Quando o mesmo SHA já está `READY`, o fluxo evita o redisparo redundante e segue para a validação declarada pelo projeto.

## Novas mutações

Rollback remoto automático, troca de alias/domínio, alteração de configuração Vercel ou qualquer nova mutação fora de `provider-deploy` continuam fora deste modelo. Cada nova capability precisa de revisão explícita de ameaça, alvo incluído no plano/hash e confirmação proporcional ao impacto.
