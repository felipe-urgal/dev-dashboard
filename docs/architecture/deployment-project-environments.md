# Ambientes locais por etapa de deployment

O domínio de deployment separa configuração local de **check** da configuração que realmente opera **produção**. Essa fronteira existe para impedir que lint, build ou testes recebam credenciais de produção apenas porque foram executados dentro de um deployment.

## Arquivos reconhecidos

```text
<Project.path>/.dev-dashboard/.env.check.local
<Project.path>/.dev-dashboard/.env.production.local
```

Os arquivos são opcionais, locais, fora do `Production Contract` e nunca são escolhidos ou enviados pelo browser.

### `.env.check.local`

É carregado **somente** em `prod:check`.

Uso típico:

```dotenv
CHECK_DATABASE_URL=postgresql://...
```

O projeto alvo decide como consumir essas variáveis. Para suítes de integração, a conexão deve apontar para um banco descartável e sem dados reais.

### `.env.production.local`

É carregado nas demais etapas locais do plano, como `prod:migrate`, `prod:verify`, `prod:backup`, `prod:deploy` e `prod:rollback` quando declaradas pelo contrato.

Uso típico:

```dotenv
DATABASE_URL=postgresql://...
```

`prod:check` nunca recebe esse arquivo.

### `provider-deploy`

A etapa externa não carrega nenhum dos dois arquivos. Providers usam seus adapters e credenciais pertencentes ao processo do Dev Dashboard, como `VERCEL_TOKEN` em `dev-dashboard/.env.local`.

## Invariantes de segurança

```text
prod:check
    └── .env.check.local

prod:migrate / verify / demais etapas locais
    └── .env.production.local

provider-deploy
    └── nenhum env de projeto
```

Regras obrigatórias:

- não existe fallback automático entre check e produção;
- uma variável do arquivo da etapa prevalece somente no ambiente do processo filho daquela execução;
- `process.env` do Dev Dashboard não é alterado;
- cada arquivo precisa ser regular, ter no máximo 64 KiB e ser parseável como dotenv;
- arquivo inválido falha fechado antes do spawn da etapa correspondente;
- erro não inclui conteúdo do arquivo;
- conteúdo não é persistido no `DeploymentStore` nem devolvido pela API;
- ambos os arquivos devem permanecer fora do Git e com permissões locais restritas.

## Motivação

Um `prod:check` pode executar testes que escrevem em banco. Injetar `.env.production.local` nessa etapa transformaria uma validação de código em acesso acidental à produção. Remover toda configuração de banco do check, por outro lado, inviabiliza suítes de integração.

A solução é uma capacidade explícita de **check não produtivo**, independente da capacidade de produção. Assim o projeto pode validar migrations e integração contra infraestrutura descartável sem ampliar a autoridade do gate.

## Exemplo operacional

Projeto alvo:

```text
.dev-dashboard/
├── production.json
├── .env.check.local
└── .env.production.local
```

Exemplo conceitual:

```dotenv
# .env.check.local
CHECK_DATABASE_URL=postgresql://usuario:senha@localhost/banco_test
```

```dotenv
# .env.production.local
DATABASE_URL=postgresql://usuario:senha@host-producao/banco
```

Nunca reutilize a connection string de produção como ambiente de check apenas para fazer um gate passar. Se o check depende de banco, provisione um banco dedicado de teste.

## Testes obrigatórios do adapter

Mudanças nessa fronteira devem provar pelo menos:

- check recebe check e não produção;
- migrate/etapas produtivas recebem produção e não check;
- arquivos ausentes preservam o ambiente herdado;
- arquivo de check inválido bloqueia somente check;
- arquivo de produção inválido não bloqueia check e bloqueia a etapa produtiva correspondente;
- provider-deploy não passa por carregamento de env de projeto.

Relacionado: issue #511.
