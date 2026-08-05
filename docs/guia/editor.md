# Guia da aba Editor

> Parte do [Guia passo a passo do dashboard web](README.md).

Um editor de código embutido no navegador (baseado no Monaco, o mesmo motor do VS Code), para
abrir, editar e salvar arquivos do projeto sem sair do dashboard — além de poder abrir o projeto
inteiro em um editor externo instalado na máquina.

## O que aparece na tela

- Uma árvore de arquivos lateral, expansível, com busca por nome de arquivo ou por símbolo
  (digitando `@nome-do-simbolo`).
- Abas de arquivos abertos: um clique simples abre em modo **preview** (a aba é substituída ao
  abrir outro arquivo); um duplo clique **fixa** a aba (fica aberta permanentemente).
- Indicadores de status do Language Server (LSP) para JavaScript/TypeScript e para Ruby, e um
  indicador separado para o "Rails runtime" com botões para habilitar/desabilitar.
- Seletor de tema do editor.
- Botão **Salvar** (ou `Ctrl+S`).
- Um painel de IA que pode ser aberto/fechado.
- Ferramentas para criar arquivo, criar pasta, renomear e excluir, na própria árvore de arquivos.
- Um botão para abrir o projeto em um **editor externo** já instalado na máquina.

## Abrir, ler e salvar arquivos

- Listar uma pasta e ler o conteúdo de um arquivo são operações somente leitura.
- Ao salvar, o dashboard usa **concorrência otimista**: ele sabe qual era a "versão" do arquivo
  (um hash do conteúdo) no momento em que você abriu para editar. Se alguém (ou outro processo)
  mudou o arquivo no disco nesse meio-tempo, o salvamento é recusado com o erro
  `FILE_CHANGED_EXTERNALLY`, e o dashboard mostra uma comparação entre a versão base, a sua edição
  local e o que está no disco agora — para você decidir o que manter.
- A gravação em si é **atômica**: o dashboard escreve primeiro em um arquivo temporário ao lado do
  original, confirma que tudo foi gravado corretamente no disco, confere que o arquivo alvo não
  virou um link simbólico nem mudou de conteúdo enquanto isso, e só então substitui o arquivo
  original. Isso evita arquivos corrompidos/pela metade se a gravação for interrompida no meio.
- Arquivos maiores que 512 KB não podem ser abertos nem editados por aqui.
- Alguns arquivos nunca aparecem no explorer nem podem ser lidos, por serem considerados
  sensíveis ou irrelevantes: `.git`, `node_modules`, `vendor/bundle`, `coverage`, `dist`, `build`,
  `tmp/log`, `config/master.key`, chaves privadas (`id_rsa`, `id_ed25519`, `*.pem`, `*.key`) e
  qualquer variação de `.env*`.

## Criar, renomear e excluir arquivos/pastas

- **Criar** arquivo ou pasta é uma ação direta — mas nunca sobrescreve algo que já existe com o
  mesmo nome; se já existir, a criação falha em vez de apagar o conteúdo anterior.
- **Renomear** e **excluir** passam por um fluxo de duas etapas parecido com o das mutações do
  Git: primeiro o dashboard calcula o impacto da operação (quantos arquivos/pastas serão afetados,
  quantos bytes ao todo) e devolve um token de confirmação válido por **5 minutos**. Se a exclusão
  for de uma **pasta não vazia**, é exigido digitar o caminho exato dela para liberar o botão.
- No momento de aplicar de fato, o dashboard reconfere que nada mudou desde o cálculo do impacto;
  se algo mudou (por exemplo, você editou um arquivo daquela pasta enquanto o modal estava aberto),
  a operação é recusada em vez de aplicar sobre um estado desatualizado.
- Existe um limite de segurança de 2.000 itens ou 100 MB por operação de mutação.

## Editor externo

O botão de abrir em editor externo reconhece um catálogo fechado de cinco opções: VS Code, Cursor,
VSCodium, Sublime Text e Zed. O dashboard varre o `PATH` da máquina para achar o executável (sem
usar `which` nem um shell) e o abre apontando para a pasta do projeto. Se nenhum dos editores
suportados estiver instalado, aparece o erro "editor não disponível".

## Language Server (autocompletar, ir para definição, diagnósticos)

Quando disponível, o editor liga um Language Server de verdade em segundo plano, conectado por
WebSocket:

- **JavaScript/TypeScript**: usa o `typescript-language-server` do próprio projeto (se instalado
  em `node_modules/.bin`) ou um instalado globalmente na máquina.
- **Ruby**: usa o `ruby-lsp` — do `Gemfile.lock` do projeto (rodando via `bundle exec`) se ele já
  estiver resolvido, ou um `ruby-lsp` instalado globalmente como alternativa. Isso **nunca**
  dispara um `bundle install`.
- Habilitar a **introspecção Rails** (o complemento `ruby-lsp-rails`) é uma ação separada, que
  exige confirmação explícita, porque isso liga a aplicação Rails de verdade em segundo plano
  (banco de dados, cache, configuração local) só para oferecer autocompletar mais rico — por isso
  não vem ligado por padrão.

## Limites e erros comuns

Arquivo binário, arquivo grande demais, caminho fora do projeto, arquivo inexistente, sem
permissão de escrita, alterado externamente desde a última leitura, ou confirmação de exclusão/
renomeação vencida — todos esses casos têm uma mensagem específica em vez de uma falha genérica.
