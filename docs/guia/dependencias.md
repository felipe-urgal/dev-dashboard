# Guia da aba Dependências

> Parte do [Guia passo a passo do dashboard web](README.md).

Um atalho para as ações mais comuns de gerenciamento de dependências (Ruby/Bundler e Node), sem
precisar abrir um terminal. As ações vêm do mesmo catálogo fechado da aba [Scripts](scripts.md)
(`instalar`/`atualizar`/`build`), mas a execução roda num terminal PTY destacável — mesmo mecanismo
usado pela suíte completa de Testes e pelas operações de Migration Rails (ver
`docs/architecture/security.md`), não mais pelo motor de Scripts baseado em SSE.

## O que aparece na tela

- Um cartão para **Ruby/Bundler** (quando o projeto é Rails/Ruby) e outro para **Node** com o
  gerenciador detectado (npm, yarn, pnpm ou bun).
- Uma tabela de ações disponíveis, com o gerenciador, o nome da ação, o comando exato que vai
  rodar e um botão Executar.
- Um terminal com a saída ao vivo da execução, cores e formatação nativas de quem gerou o build ou
  instalou as dependências. A execução continua no servidor mesmo que a aba seja fechada — reabrir
  a aba de Dependências reconecta e mostra a saída acumulada. Só uma ação por vez; um botão
  **Cancelar** aparece enquanto ela está rodando. Não há mais histórico de execuções recentes nem o
  Diagnóstico especializado que existiam no motor antigo — a execução corrente é a única mantida.

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

Toda ação aqui, exceto "Verificar dependências Ruby", muda algo no ambiente local, então pede
confirmação explícita no próprio navegador antes de o comando realmente rodar. Diferente de outras
mutações do dashboard, não há token de confirmação do servidor: a conexão de execução é um
WebSocket somente leitura (sem canal de `input`), então não existe stdin livre a proteger — ver
`docs/architecture/security.md`.

## Como o comando é resolvido com segurança

O dashboard não aceita nenhum texto de comando vindo do navegador. Cada ação vem de um catálogo
fechado, e o gerenciador de pacotes é detectado automaticamente pelo lockfile presente no projeto
— se houver mais de um lockfile ao mesmo tempo (por exemplo, `package-lock.json` e `yarn.lock`
juntos), a ação é recusada por ambiguidade, para não rodar o gerenciador errado.
