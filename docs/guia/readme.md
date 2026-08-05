# Guia da aba README

> Parte do [Guia passo a passo do dashboard web](README.md).

Mostra a documentação Markdown que já existe dentro do próprio projeto, sem precisar abrir o
editor de código ou um terminal.

## O que aparece na tela

- Um contador do tipo "N arquivos Markdown encontrados".
- Se o projeto tiver mais de um arquivo `.md`, uma lista lateral para escolher qual visualizar.
- O conteúdo renderizado do arquivo escolhido: títulos, parágrafos, listas, citações, divisores e
  blocos de código com botão **Copiar**.
- Um botão **Atualizar**, para reler os arquivos do disco sem recarregar a página inteira.

## Como funciona por trás

1. O dashboard varre o diretório do projeto em busca de arquivos terminados em `.md`, `.markdown`
   ou `.mdown`, até 8 níveis de profundidade e no máximo 200 arquivos. Pastas como `node_modules`
   e `.git` são ignoradas automaticamente.
2. A lista é ordenada colocando primeiro o que mais parece ser a documentação principal:
   `README.md`, depois variações de "readme", depois outros formatos de texto (`.rdoc`, `.adoc`).
3. Ao escolher um arquivo, o dashboard lê o conteúdo do disco e renderiza no navegador com um
   interpretador de Markdown próprio (sem depender de nenhum serviço externo).

Essa aba **nunca executa nenhum comando** — é leitura pura de arquivo. As mesmas regras de
segurança do Editor se aplicam aqui: o caminho é sempre confinado à raiz do projeto (não é
possível "escapar" para fora dele, mesmo com link simbólico), e arquivos maiores que 512 KB não
são exibidos.

## Quando usar

Para consultar rapidamente instruções de setup, convenções do projeto ou notas de arquitetura que
a equipe já documentou, sem sair do dashboard.
