# Guia da aba Dependências

> Parte do [Guia passo a passo do dashboard web](README.md).

Um atalho para as ações mais comuns de gerenciamento de dependências (Ruby/Bundler e Node), sem
precisar abrir um terminal. Ela reaproveita o mesmo motor de execução da aba
[Scripts](scripts.md), mostrando só a parte relacionada a dependências.

## O que aparece na tela

- Um cartão para **Ruby/Bundler** (quando o projeto é Rails/Ruby) e outro para **Node** com o
  gerenciador detectado (npm, yarn, pnpm ou bun).
- Uma tabela de ações disponíveis, com o gerenciador, o nome da ação, o comando exato que vai
  rodar e um botão Executar.
- Um console com o log da execução em tempo real e um pequeno histórico das últimas execuções
  feitas por essa aba.

## Ações disponíveis

| Ação | Comando | Tipo |
|---|---|---|
| Verificar dependências Ruby | `bundle check` | Somente leitura |
| Instalar dependências Ruby | `bundle install` | Muda o ambiente local |
| Atualizar dependências Ruby | `bundle update` | Muda o ambiente local **e pode alterar o `Gemfile.lock`** |
| Instalar dependências Node | `<npm\|pnpm\|yarn> install` | Muda o ambiente local |
| Build do projeto (se existir script `build`) | script `build` do `package.json` | Muda o ambiente local |

**Atualizar dependências Ruby** mostra um aviso explícito de que a versão travada das gems
(`Gemfile.lock`) pode mudar — o que costuma exigir revisão antes de commitar.

## Confirmação antes de executar

Toda ação aqui, exceto "Verificar dependências Ruby", muda algo no ambiente local, então segue o
mesmo padrão de confirmação usado em outras mutações do dashboard: é preciso confirmar
explicitamente antes de o comando realmente rodar, e cada execução usa um token de confirmação de
uso único.

## Como o comando é resolvido com segurança

O dashboard não aceita nenhum texto de comando vindo do navegador. Cada ação vem de um catálogo
fechado, e o gerenciador de pacotes é detectado automaticamente pelo lockfile presente no projeto
— se houver mais de um lockfile ao mesmo tempo (por exemplo, `package-lock.json` e `yarn.lock`
juntos), a ação é recusada por ambiguidade, para não rodar o gerenciador errado.
