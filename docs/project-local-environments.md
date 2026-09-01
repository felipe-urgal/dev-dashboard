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

O `prod:check` também pode receber o ambiente de check. Ele continua isolado de `.env.production.local` e, portanto, não ganha acesso ao banco de produção apenas por fazer parte de um plano de deployment.

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
- **Abrir deployment**: prefere `inspectorUrl` retornado pela Vercel, abrindo a página de inspeção daquele deployment; se o provider não retornar esse campo, usa a URL do deployment como fallback.

Assim, navegar para a aplicação publicada e investigar um deployment são ações distintas na interface.
