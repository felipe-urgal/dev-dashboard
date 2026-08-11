# Guia da aba Scripts

> Parte do [Guia passo a passo do dashboard web](README.md).

O catálogo completo de comandos que o dashboard reconhece e sabe executar com segurança para
aquele projeto — scripts do `package.json`, tarefas Rake do Rails, e os executáveis que o próprio
projeto disponibiliza em `bin/`. As ações de instalar/atualizar dependências e rodar o build não
aparecem aqui — ficam reservadas para a aba [Dependências](dependencias.md), que as executa num
terminal PTY à parte.

## O que aparece na tela

Duas seções, em abas:

- **Catálogo**: uma barra lateral de categorias, filtros por origem (`package.json`, tarefas Rake,
  executáveis de `bin/`) e por nível de risco (somente leitura / mutável / destrutivo), busca
  global, cartões de script paginados, um painel de detalhe com o comando (mostrando onde entram
  variáveis, se a tarefa aceitar alguma) e um formulário para preenchê-las quando aplicável. O
  botão de executar mostra um aviso de confirmação sempre que a ação não for somente leitura.
- **Execuções**: histórico completo de execuções passadas, com métricas, opções de cancelar uma em
  andamento, repetir uma anterior, e um painel de log exportável.

## O que entra no catálogo

- **Scripts do `package.json`** (Node): qualquer entrada em `scripts`, executada como
  `<gerenciador> run <nome>`.
- **Bundler** (Ruby): `bundle check`, `bundle install`, `bundle update`.
- **Instalar pacotes Node**: `<gerenciador> install`.
- **Executáveis em `bin/`**: só aparecem se o arquivo realmente existir no projeto —
  `bin/rails`, `bin/rake`, `bin/rspec`, `bin/rubocop`, `bin/setup`.
- **Tarefas Rake** (`rails-task:<nome>`): o dashboard lê os arquivos `.rake` e o `Rakefile` do
  projeto para descobrir quais tarefas existem e se elas esperam alguma variável de ambiente
  (`ENV['ALGO']`) — sem nunca rodar `rake -T` para isso. Tarefas cujas variáveis o dashboard não
  consegue interpretar com segurança ficam de fora do catálogo.

## Classificação automática de risco

O nome de cada ação é comparado contra padrões conhecidos:

- Contém palavras como `drop`, `reset`, `destroy`, `delete`, `clean`, `truncate` ou `purge` →
  classificada como **destrutiva** — e nesse caso **vem desabilitada por padrão**, sem nenhum
  botão ativo para executá-la direto pela lista. É preciso reconhecê-la explicitamente antes.
- Contém palavras como `check`, `lint`, `test`, `spec`, `typecheck`, `audit`, `status`, `list` ou
  `routes` → classificada como **somente leitura**, nunca exige confirmação.
- Qualquer outra → classificada como **mutável**, exige confirmação antes de rodar.

## Confirmação e variáveis

Para ações mutáveis, o fluxo é o mesmo padrão de confirmação usado no restante do dashboard: um
token de uso único, com validade curta, gerado a partir da ação **e** das variáveis preenchidas —
se você mudar o valor de uma variável depois de confirmar, o token anterior deixa de valer.
Algumas variáveis nunca são aceitas, mesmo que uma tarefa pareça esperar por elas — nomes como
`PATH`, `HOME`, `GEM_HOME` ou qualquer coisa que comece com `BUNDLE_`, por exemplo, são bloqueados
porque poderiam alterar o comportamento do processo de forma perigosa. Há também um limite de 20
variáveis por execução, 4 KB cada.

## Execução e tempo real

O comando roda de forma independente (sem shell), com o log salvo em um arquivo próprio daquela
execução. Só uma execução por projeto por vez. O acompanhamento é feito por eventos de servidor
(SSE), com reconexão automática. Cancelar uma execução em andamento primeiro confirma que o
processo ainda é o mesmo que foi iniciado, antes de encerrá-lo.

## Segredos no log

Assim como em Logs e em Testes, o conteúdo do log de uma execução passa pela mesma máscara
automática de segredos antes de chegar ao navegador.
