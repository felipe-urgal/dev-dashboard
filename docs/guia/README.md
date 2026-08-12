# Guia passo a passo do dashboard web

Este guia documenta, aba por aba, o que a interface do dashboard web mostra na tela, o que cada
botÃ£o faz, qual comando Ã© executado por trÃ¡s e para que serve. Ã escrito pensando em quem usa o
dashboard no dia a dia â nÃ£o Ã© uma referÃªncia de arquitetura (para isso, veja
[`docs/architecture/overview.md`](../architecture/overview.md)) nem a referÃªncia bruta de rotas da
API (veja [`docs/architecture/api-reference.md`](../architecture/api-reference.md)).

Cada projeto aberto no dashboard (`http://127.0.0.1:5173`) tem as seguintes abas:

| Aba | O que faz | Guia |
|---|---|---|
| README | Mostra a documentaÃ§Ã£o Markdown que jÃ¡ existe no projeto. | [readme.md](readme.md) |
| DiagnÃ³stico | Checa a saÃºde do ambiente local do projeto (runtimes, dependÃªncias, variÃ¡veis esperadas). | [diagnostico.md](diagnostico.md) |
| Servidor | Liga, desliga e monitora o servidor de desenvolvimento do projeto. | [servidor.md](servidor.md) |
| Logs | Acompanha a saÃ­da do servidor em tempo quase real, com leitura estruturada para Rails. | [logs.md](logs.md) |
| Git | SincronizaÃ§Ã£o, branches, diff, commit, desfazer, pull request, Code review IA (Ollama local), histÃ³rico e mutaÃ§Ãµes. | [git.md](git.md) |
| Testes | Roda a suÃ­te completa via terminal PTY destacÃ¡vel (PoC â arquivo especÃ­fico, testes relacionados e histÃ³rico temporariamente fora do ar). | [testes.md](testes.md) |
| Banco de dados | Detecta bancos/serviÃ§os do projeto, inicia serviÃ§os reconhecidos e cria/restaura snapshots (sÃ³ quando o projeto tem suporte a banco). | [banco-de-dados.md](banco-de-dados.md) |
| DependÃªncias | Instala/atualiza dependÃªncias Ruby e Node com um clique. | [dependencias.md](dependencias.md) |
| Scripts | CatÃ¡logo completo de comandos seguros do projeto (scripts, tarefas Rake, executÃ¡veis de `bin/`). | [scripts.md](scripts.md) |
| Terminal / Console | Shell interativo e (para projetos Rails) `rails console` direto no navegador. | [terminal.md](terminal.md) |
| Sidekiq/webpack | Acompanha e controla os processos de Sidekiq e webpack watcher de projetos Rails. | â |
| VariÃ¡veis de ambiente | Mostra (sem editar) as variÃ¡veis de ambiente configuradas, ocultando valores sensÃ­veis. | [variaveis-de-ambiente.md](variaveis-de-ambiente.md) |

As abas **Banco de dados** (projetos sem suporte a banco detectado), **DependÃªncias** (sÃ³ Rails/Node),
**Console** e **Sidekiq/webpack** (sÃ³ projetos Rails) aparecem condicionalmente, conforme o tipo e as
capacidades do projeto aberto.

## Um princÃ­pio comum a quase todas as abas

O navegador nunca manda um comando de shell arbitrÃ¡rio para a API. Toda aÃ§Ã£o mutÃ¡vel (criar
branch, salvar um arquivo, rodar um script, ligar um servidor) escolhe uma opÃ§Ã£o de um **catÃ¡logo
fechado** que a prÃ³pria API jÃ¡ conhece, e a maioria das aÃ§Ãµes que alteram algo de forma relevante
pede uma **confirmaÃ§Ã£o explÃ­cita** antes de executar de verdade â normalmente por meio de um token
que sÃ³ vale para aquela aÃ§Ã£o especÃ­fica, por um tempo curto, e que sÃ³ pode ser usado uma vez. Esse
padrÃ£o aparece com mais detalhe em cada guia individual, mas vale ter em mente como pano de fundo
comum ao ler qualquer uma das pÃ¡ginas acima.

A Ãºnica exceÃ§Ã£o deliberada Ã© a aba **Terminal / Console** ([terminal.md](terminal.md)): ali o
navegador de fato abre uma sessÃ£o de shell interativa, sem catÃ¡logo fechado de comandos. Essa
exceÃ§Ã£o Ã© explÃ­cita, documentada e cercada de salvaguardas prÃ³prias (confirmaÃ§Ã£o obrigatÃ³ria a
cada sessÃ£o, aviso de risco na tela, limite de sessÃµes simultÃ¢neas) â ver
[`docs/architecture/security.md`](../architecture/security.md#terminal-e-console-do-projeto).
