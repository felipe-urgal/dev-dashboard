# Segurança do provider Vercel

Esta nota complementa [Segurança e modelo de ameaça](security.md) para o adapter `strategy=git-managed` + `provider=vercel` do domínio de deployment.

A integração desta fase é **somente leitura**. Ela consulta estado de produção e não transforma uma credencial Vercel em autorização para criar deployment, promover código, fazer rollback, cancelar deployment ou executar Git remoto.

## Fronteira de confiança

O vínculo entre projeto local e Vercel vem exclusivamente de `production.external.project` em um `Production Contract v1` já validado. O backend não usa nome da pasta, repositório, workspace ou usuário autenticado como fallback implícito.

O browser não envia:

- token Vercel;
- team id;
- host da API;
- URL arbitrária de provider;
- headers externos;
- programa, argumentos ou corpo de shell.

## Credenciais

`VERCEL_TOKEN` e, quando necessário, `VERCEL_TEAM_ID` são lidos apenas do ambiente do processo local do Dev Dashboard.

Esses valores:

- não pertencem ao manifesto do projeto;
- não são persistidos pelo domínio de deployment;
- não são retornados pela API local;
- não são incluídos em logs ou mensagens de erro do provider.

## Saída para a Vercel

O adapter usa a API HTTPS fixa da Vercel. `external.project` participa somente como identificador de projeto, codificado como segmento de path; o ID canônico retornado pelo provider é usado na consulta de deployments.

A resposta externa possui timeout e limite de tamanho aceito. Somente os campos necessários ao status operacional são utilizados: projeto, deployment de produção, URL, estado e metadados Git de branch/SHA quando presentes.

Bodies e mensagens brutas de erro não são repassados ao browser. Falhas esperadas viram códigos estáveis `DEPLOYMENT_PROVIDER_*` para configuração ausente, autenticação recusada, quota, projeto ausente, indisponibilidade e resposta inválida.

## Git e drift

A consulta de drift lê apenas a ref local já conhecida em `refs/remotes/origin/<production.branch>` usando Git sem shell.

Ela não executa `git fetch`, `git pull`, `git push` nem qualquer outra mutação. Se a ref remota não existir localmente, o resultado é `drift=unknown`.

Diferença entre SHA de `origin/<branch>` e SHA de produção significa somente `drift`; o domínio não deduz `ahead`, `behind` ou ancestralidade sem uma análise Git específica.

## Health, migration e promoção

`READY` da Vercel representa somente o estado reportado pelo provider para o deployment observado. Ele não substitui health/readiness do Production Contract.

`prod:migrate` e `prod:verify`, quando declarados, continuam operações independentes. O adapter não fabrica um `prod:deploy` local e não esconde `git push`, promoção Vercel ou outro mecanismo de publicação atrás de uma ação genérica.

Quota externa nunca é contornada com commit artificial ou redisparo automático.

Qualquer futura mutação no provider exige revisão explícita deste modelo de ameaça, plano/preview próprio e confirmação vinculada ao alvo antes de entrar na API.
