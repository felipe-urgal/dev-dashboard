# Guia passo a passo do dashboard web

Este guia documenta, aba por aba, o que a interface do dashboard web mostra na tela, o que cada
botão faz, qual comando é executado por trás e para que serve. É escrito pensando em quem usa o
dashboard no dia a dia — não é uma referência de arquitetura (para isso, veja
[`docs/architecture/overview.md`](../architecture/overview.md)) nem a referência bruta de rotas da
API (veja [`docs/architecture/api-reference.md`](../architecture/api-reference.md)).

Cada projeto aberto no dashboard (`http://127.0.0.1:5173`) tem as seguintes abas:

| Aba | O que faz | Guia |
|---|---|---|
| README | Mostra a documentação Markdown que já existe no projeto. | [readme.md](readme.md) |
| Diagnóstico | Checa a saúde do ambiente local do projeto (runtimes, dependências, variáveis esperadas). | [diagnostico.md](diagnostico.md) |
| Editor | Edita arquivos do projeto direto no navegador, com autocompletar via Language Server. | [editor.md](editor.md) |
| Servidor | Liga, desliga e monitora o servidor de desenvolvimento do projeto. | [servidor.md](servidor.md) |
| Logs | Acompanha a saída do servidor em tempo quase real, com leitura estruturada para Rails. | [logs.md](logs.md) |
| Git | Sincronização, branches, diff, commit, desfazer, pull request, histórico e mutações. | [git.md](git.md) |
| Testes | Executa a suíte de testes, um arquivo específico, ou só os testes relacionados às mudanças atuais. | [testes.md](testes.md) |
| Dependências | Instala/atualiza dependências Ruby e Node com um clique. | [dependencias.md](dependencias.md) |
| Scripts | Catálogo completo de comandos seguros do projeto (scripts, tarefas Rake, executáveis de `bin/`). | [scripts.md](scripts.md) |
| Terminal / Console | Shell interativo e (para projetos Rails) `rails console` direto no navegador. | [terminal.md](terminal.md) |
| Variáveis de ambiente | Mostra (sem editar) as variáveis de ambiente configuradas, ocultando valores sensíveis. | [variaveis-de-ambiente.md](variaveis-de-ambiente.md) |

## Um princípio comum a quase todas as abas

O navegador nunca manda um comando de shell arbitrário para a API. Toda ação mutável (criar
branch, salvar um arquivo, rodar um script, ligar um servidor) escolhe uma opção de um **catálogo
fechado** que a própria API já conhece, e a maioria das ações que alteram algo de forma relevante
pede uma **confirmação explícita** antes de executar de verdade — normalmente por meio de um token
que só vale para aquela ação específica, por um tempo curto, e que só pode ser usado uma vez. Esse
padrão aparece com mais detalhe em cada guia individual, mas vale ter em mente como pano de fundo
comum ao ler qualquer uma das páginas acima.

A única exceção deliberada é a aba **Terminal / Console** ([terminal.md](terminal.md)): ali o
navegador de fato abre uma sessão de shell interativa, sem catálogo fechado de comandos. Essa
exceção é explícita, documentada e cercada de salvaguardas próprias (confirmação obrigatória a
cada sessão, aviso de risco na tela, limite de sessões simultâneas) — ver
[`docs/architecture/security.md`](../architecture/security.md#terminal-e-console-do-projeto).
