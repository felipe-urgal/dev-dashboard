# Guia passo a passo do dashboard web

Este guia documenta, aba por aba, o que a interface do dashboard web mostra, o que cada botão faz e qual operação existe por trás. É voltado ao uso cotidiano; arquitetura e contratos vivem em [`docs/architecture/overview.md`](../architecture/overview.md) e [`docs/architecture/api-reference.md`](../architecture/api-reference.md).

Cada projeto aberto no dashboard (`http://127.0.0.1:5173`) pode apresentar as seguintes abas, conforme suas capabilities:

| Aba | O que faz | Guia |
|---|---|---|
| README | Mostra a documentação Markdown que já existe no projeto. | [readme.md](readme.md) |
| Diagnóstico | Checa a saúde do ambiente local do projeto. | [diagnostico.md](diagnostico.md) |
| Servidor | Liga, desliga e monitora o servidor de desenvolvimento. | [servidor.md](servidor.md) |
| Logs | Acompanha a saída do servidor em tempo quase real. | [logs.md](logs.md) |
| Git | Sincronização, branches, diff, commit, desfazer, pull request e histórico. | [git.md](git.md) |
| Testes | Executa testes reconhecidos pelo projeto. | [testes.md](testes.md) |
| Banco de dados | Detecta bancos/serviços e oferece operações reconhecidas. | [banco-de-dados.md](banco-de-dados.md) |
| Dependências | Instala/atualiza dependências Ruby e Node reconhecidas. | [dependencias.md](dependencias.md) |
| Produção | Mostra revision/health/drift e prepara deployments `command` ou Vercel `git-managed`. | [producao.md](producao.md) |
| Terminal / Console | Shell interativo e, para Rails, `rails console`. | [terminal.md](terminal.md) |
| Sidekiq/webpack | Acompanha processos Rails reconhecidos. | — |
| Variáveis de ambiente | Mostra variáveis configuradas sem persistir valores sensíveis. | [variaveis-de-ambiente.md](variaveis-de-ambiente.md) |

Antes de abrir um projeto, o seletor de workspace permite cadastrar, renomear, remover e trocar a pasta ativa. A seleção e o scan inicial são automáticos; veja [workspaces.md](workspaces.md).

As abas condicionais aparecem apenas quando a capability existe. Em especial, **Produção** depende de um `Production Contract v1` válido. Um contrato `strategy=disabled` pode explicar o bloqueio, mas não libera uma execução mutável.

## Princípio comum das ações estruturadas

O navegador não envia linha de shell arbitrária para as operações estruturadas do dashboard. A interface escolhe uma ação de catálogo/contrato e a API resolve programa, argumentos e `cwd`.

Mutações sensíveis usam confirmação vinculada ao alvo. No caso de Produção, o preview gera um `DeploymentPlan`; somente depois da revisão a UI solicita uma confirmação de uso único vinculada a projeto, revision e `planHash`.

A exceção deliberada é **Terminal / Console**: ali existe uma sessão de shell interativa real, cercada por salvaguardas próprias. Veja [terminal.md](terminal.md) e [`security.md`](../architecture/security.md#terminal-e-console-do-projeto).

## Produção Vercel

Para `strategy=git-managed` + Vercel, a promoção remota também passa pelo domínio de deployment. A UI não inventa `prod:deploy`; ela mostra `provider-deploy` na timeline, enquanto `prod:check`, `prod:migrate` e `prod:verify` permanecem etapas locais quando declaradas.

A integração usa `VERCEL_TOKEN` no processo local do Dev Dashboard e, opcionalmente, `VERCEL_TEAM_ID`. Credenciais nunca pertencem ao manifesto do projeto nem são pedidas pela interface. Veja [producao.md](producao.md).
