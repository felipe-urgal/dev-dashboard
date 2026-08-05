# Guia da aba Diagnóstico

> Parte do [Guia passo a passo do dashboard web](README.md).

Faz uma checagem rápida da "saúde" do ambiente daquele projeto na máquina local — se as
ferramentas certas estão instaladas, se as dependências parecem resolvidas, se as variáveis de
ambiente esperadas existem — sem instalar, alterar ou executar nada do projeto em si.

## O que aparece na tela

- Um banner de status geral: **Saudável**, **Atenção** ou **Bloqueado**.
- Um resumo com contadores: quantos itens estão prontos, quantos precisam de atenção, quantos
  estão bloqueados e quantos ainda não foram verificados.
- Uma lista de verificações agrupadas por categoria (Projeto, Runtimes, Dependências,
  Configuração), cada uma com um ícone de status, uma frase de resumo e, quando aplicável, uma
  recomendação com um link direto para a aba do dashboard que resolve aquilo (Configurações,
  Servidor, Banco de dados, Dependências).
- Um botão **Verificar novamente**.

## Verificações executadas

Todas são **somente leitura** e têm um limite de tempo curto (2,5 segundos) para não travar a
tela caso alguma ferramenta trave:

- **Diretório e manifesto do projeto** — confere se a pasta existe e se há um `Gemfile` ou
  `package.json` reconhecível.
- **Variáveis de ambiente** — compara os **nomes** de variáveis declarados em `.env.example` ou
  `.env.sample` com o que existe em `.env`. Importante: só compara nomes, **nunca lê nem mostra
  valores**.
- Para projetos Node: versão do runtime (via `package.json`/`.node-version`/`.nvmrc`), qual
  gerenciador de pacotes está em uso, se `node_modules` existe, e roda `<gerenciador> --version`
  para confirmar que o gerenciador detectado realmente está instalado na máquina.
- Para projetos Rails: roda `ruby --version` para confirmar a versão do Ruby instalada, e roda
  `bundle check` para saber se as gems do `Gemfile.lock` já estão satisfeitas — **nunca** roda
  `bundle install` a partir daqui.

## Cache e atualização

O relatório fica em cache por 15 segundos por projeto, para não recalcular tudo a cada clique;
clicar em **Verificar novamente** força um recálculo imediato. Se uma verificação específica
falhar (por exemplo, o comando não existir), ela aparece como "atenção" sem derrubar as demais.

## Limites

Esta aba nunca instala pacotes, nunca executa `bundle install`/`npm install`, e nunca expõe o
valor de uma variável de ambiente — apenas confirma se o *nome* dela está presente.
