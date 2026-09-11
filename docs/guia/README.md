# Guia passo a passo do dashboard web

Este guia documenta as superfícies atuais do dashboard web e o que existe por trás delas. Arquitetura e contratos vivem em [`../architecture/overview.md`](../architecture/overview.md) e [`../architecture/api-reference.md`](../architecture/api-reference.md).

No modo de desenvolvimento, a web fica em:

```text
http://127.0.0.1:5174
```

Na instalação permanente do próprio Dashboard:

```text
http://dev-dashboard.localhost:4343
```

## Superfícies por projeto

As ferramentas aparecem conforme capabilities/tipo do projeto.

| Superfície | O que faz | Guia |
|---|---|---|
| Servidor | Lifecycle do servidor e terminal de log integrado. | [servidor.md](servidor.md), [logs.md](logs.md) |
| Git | Sincronização, branches, diff, commit, desfazer, Pull Request e histórico. | [git.md](git.md) |
| Testes | Executa testes reconhecidos e acompanha o resultado. | [testes.md](testes.md) |
| Banco de dados | Detecta ambientes/serviços e oferece operações reconhecidas. | [banco-de-dados.md](banco-de-dados.md) |
| Dependências | Ações reconhecidas de Bundler/Node e build. | [dependencias.md](dependencias.md) |
| Produção | Opera Production Contracts `command`, `git-managed`/Vercel ou o `self-update` fechado do próprio Dashboard. | [producao.md](producao.md) |
| Terminal / Console | Sessões interativas locais; Rails Console quando aplicável. | [terminal.md](terminal.md) |
| Variáveis de ambiente | Inspeção/configuração estrutural do environment sem promover secrets para superfícies comuns. | [variaveis-de-ambiente.md](variaveis-de-ambiente.md) |
| Migrations | Inspeciona o estado conhecido das migrations em modo somente leitura. | [migrations.md](migrations.md) |
| Readiness | Consolida evidências de Git, Testes, Doctor e Migrations antes da entrega. | [readiness.md](readiness.md) |
| Diagnóstico | Project Doctor/diagnósticos locais somente leitura. | [diagnostico.md](diagnostico.md) |
| README | Renderiza a documentação Markdown do projeto. | [readme.md](readme.md) |
| Sidekiq/webpack | Lifecycle/log dos runtimes Rails reconhecidos. | — |

**Logs não é mais uma aba separada.** O log do servidor fica dentro de **Servidor**; a rota histórica de Logs redireciona para essa superfície.

Banco de dados possui também uma superfície global `/database`; a rota histórica por projeto pode redirecionar para ela.

## Workspaces e home

O seletor de workspace permite cadastrar, renomear, remover e trocar a raiz ativa. Remover um workspace do Dashboard não apaga a pasta local. Veja [workspaces.md](workspaces.md).

A home apresenta a **Central de Atenção**, que agrega sinais acionáveis de domínios já conhecidos sem executar correções automaticamente. Veja [central-de-atencao.md](central-de-atencao.md).

## Regra das ações estruturadas

O navegador escolhe uma ação/ID previsto pelo contrato; a API resolve programa, argumentos, `cwd` e ownership.

Mutações sensíveis usam confirmação/revalidação apropriadas. Terminal/Console são exceções deliberadas porque oferecem sessão interativa real e possuem salvaguardas próprias.

## Produção Vercel

Em `strategy=git-managed` + Vercel:

```text
check → migrate? → provider-deploy → verify
```

Não existe `prod:deploy` local artificial. Antes da promoção, o backend comprova a revision remota e envia o SHA exato ao provider.

`VERCEL_TOKEN`/`VERCEL_TEAM_ID` permanecem na configuração local do processo do Dev Dashboard, nunca no manifesto do projeto.

## Self-production do Dev Dashboard

O próprio Dashboard usa:

```text
strategy=self-update
provider=none
branch=main
```

A operação passa por planner, confirmação, handoff/agent, fast-forward, restart e proof-of-revision. Não existe `prod:deploy` local.

Na instalação `systemd --user`, o runtime permanente pertence à unit fixa `dev-dashboard.service`. A limitação atual do redeploy gerenciado está rastreada em #659.

Veja [producao.md](producao.md) e [`../PRODUCTION.md`](../PRODUCTION.md).
