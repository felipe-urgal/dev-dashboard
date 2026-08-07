# Guia das abas Terminal e Console

> Parte do [Guia passo a passo do dashboard web](README.md).

Duas abas que abrem uma sessão de shell interativa de verdade dentro do navegador, via
WebSocket, usando um pseudoterminal (PTY) real — não uma simulação de linha de comando.

- **Terminal**: aparece em qualquer projeto. Abre o shell do seu usuário (`$SHELL`, ou `bash` se
  a variável não estiver definida) na raiz do projeto.
- **Console**: aparece só em projetos Rails. Abre `bin/rails console` (ou `bundle exec rails
  console` quando o projeto não tem o binstub) na raiz do projeto.

## Isto é uma exceção deliberada

Todo o resto do dashboard segue o princípio de **catálogo fechado de ações**: o navegador nunca
manda um comando de shell livre para a API (ver o aviso no topo de [README.md](README.md)). O
Terminal e o Console quebram esse princípio de propósito — é literalmente um shell — porque essa
foi uma escolha explícita e consciente, não um descuido. Por isso existem salvaguardas que as
outras abas não precisam:

- Ao entrar na aba Terminal ou Console, o dashboard já solicita sozinho o token de confirmação de
  curta duração (1 minuto, uso único) e abre o WebSocket automaticamente — não é preciso clicar em
  "Iniciar sessão" a cada vez. Isso só acontece uma vez por visita à aba: fechar a sessão
  manualmente ("Encerrar sessão") não a reabre sozinha, é preciso clicar em "Abrir nova sessão".
  Reconectar depois de uma queda de conexão passa pelo mesmo fluxo de token — sessões não
  sobrevivem a uma desconexão.
- A tela mostra um aviso de risco assim que a aba é aberta: os comandos digitados rodam com as
  mesmas permissões do seu usuário no sistema operacional, sem qualquer filtro.
- Existe um limite de sessões simultâneas (por projeto e no total da instância) para evitar que uma
  aba esquecida aberta, ou um script comportando-se mal, crie processos sem limite.
- Fechar a aba, recarregar a página ou clicar em "Encerrar sessão" mata o processo do shell —
  não existe sessão "em segundo plano" sobrevivendo sem um navegador conectado a ela.

## O que não existe (ainda)

- Não há persistência de sessão entre reconexões (tipo `tmux`/`screen`): cada conexão nova é um
  processo novo.
- Não há histórico de comandos gravado pelo dashboard, nem replay do que foi digitado — o que
  aparece na tela é só o que o próprio terminal (bash/IRB) já mantém em memória durante a sessão.
- Não há upload/download de arquivos por aqui — para isso, use a aba Editor.

## Como funciona por trás

O navegador conecta um WebSocket a `/api/projects/:id/terminal/:kind/connect`, autenticado do
mesmo jeito que o resto da API (cookie de sessão local) mais o token de confirmação de uso único
descrito acima. A API usa [`node-pty`](https://github.com/microsoft/node-pty) para abrir um
pseudoterminal de verdade, encaminha a saída do processo para o navegador e aplica o
redimensionamento (`resize`) enviado pelo terminal do navegador ([xterm.js](https://xtermjs.org/))
sempre que a área da aba muda de tamanho. Ver
[`docs/architecture/security.md`](../architecture/security.md#terminal-e-console-do-projeto) para o
modelo de ameaça completo dessa exceção.
