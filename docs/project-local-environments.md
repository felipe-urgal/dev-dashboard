# Ambientes locais por projeto

O Dev Dashboard pode carregar ambientes locais específicos do projeto sem colocar segredos no contrato público ou no browser.

## Check e testes

Use o arquivo local:

```text
<projeto>/.dev-dashboard/.env.check.local
```

Exemplo:

```dotenv
CHECK_DATABASE_URL=postgresql://usuario:senha@localhost:5432/projeto_test
```

A aba **Testes** carrega esse arquivo somente no processo filho do comando detectado. Quando `CHECK_DATABASE_URL` existe, o backend o promove para `DATABASE_URL` nessa execução para que suítes que esperam a variável padrão usem o banco de check.

A aba Testes não usa `DATABASE_URL` herdada do processo da API como fallback: sem `CHECK_DATABASE_URL`, `DATABASE_URL` é explicitamente esvaziada. Credenciais do provider do dashboard, como `VERCEL_TOKEN` e `VERCEL_TEAM_ID`, também são removidas da execução de testes.

O `prod:check` também pode receber o ambiente de check. Ele continua isolado de `.env.production.local` e, portanto, não ganha acesso ao banco de produção apenas por fazer parte de um plano de deployment.

### Diagnóstico de dependência no `prod:check`

Quando um `prod:check` termina com o código estável `P1001` do Prisma, o domínio de deployment classifica a falha como `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE`. A timeline continua marcando a etapa `check` como falha, enquanto o log e o estado principal da tela de Produção exibem uma orientação sanitizada para verificar se o banco do ambiente de check está pronto.

O diagnóstico gerado pelo Dev Dashboard não copia host, porta, URL, nome do banco ou credenciais do stderr. O log original continua passando pelo mascaramento já existente.

Essa classificação é apenas informativa: o Dev Dashboard não inicia PostgreSQL, Docker, Compose ou qualquer outro serviço específico do projeto. O próprio projeto continua responsável por readiness, retries e lifecycle das dependências usadas pelo `prod:check`. Outros erros de conexão e ocorrências de `P1001` fora de `prod:check` permanecem no tratamento genérico, evitando heurísticas amplas sobre infraestrutura do projeto.

## Produção

Operações locais que realmente consultam ou alteram produção usam:

```text
<projeto>/.dev-dashboard/.env.production.local
```

Esse ambiente é destinado a etapas como migration/verify conforme o contrato. `provider-deploy` não recebe variáveis do projeto; credenciais do provider, como `VERCEL_TOKEN`, permanecem no ambiente do Dev Dashboard.

## Regras de segurança

Para os dois arquivos:

- o path é fixo e não é escolhido pelo browser;
- ausência do arquivo é válida;
- somente arquivo regular é aceito; symlinks e diretórios são rejeitados;
- o limite é 64 KiB;
- conteúdo inválido ou ilegível falha antes do spawn;
- valores são aplicados somente ao processo filho;
- conteúdo não é persistido nem retornado pela API;
- mantenha os arquivos fora do Git e com permissões locais restritas.

Nunca use `.env.production.local` para testes automatizados.

## Links Vercel na tela de produção

A tela diferencia dois destinos:

- **Abrir produção**: usa a URL pública derivada do health declarado no Production Contract; se o contrato não declarar health, usa a URL pública do deployment como fallback.
- **Abrir deployment**: usa o `inspectorUrl` do deployment específico retornado pela Vercel; se o provider não informar esse campo, a URL pública do deployment é usada apenas como fallback.

Assim, abrir a aplicação de produção e inspecionar a execução específica na Vercel são ações distintas na interface. A área **Domains** continua sendo configuração de domínio/DNS e não é o destino do botão de deployment.
