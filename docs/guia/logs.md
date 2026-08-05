# Guia da aba Logs

> Parte do [Guia passo a passo do dashboard web](README.md).

Mostra a saída do servidor de desenvolvimento (a mesma que apareceria no terminal, se você tivesse
rodado o comando manualmente), com filtros, busca e uma leitura especial para projetos Rails.

## O que aparece na tela

- Uma barra de status do servidor: porta, PID, código de saída (se já parou) e quantas linhas
  estão visíveis.
- Quando o dashboard reconhece o formato de log de requisições do Rails, um resumo é calculado
  automaticamente: total de requisições, quantas tiveram sucesso, quantas deram erro, quantidade
  de queries de banco, tempo médio e a requisição mais lenta.
- Duas formas de visualizar:
  - **Requisições**: um inspetor estruturado, separado por requisição — duração, queries agrupadas
    por padrão de SQL (com aviso quando detecta um possível problema de N+1 queries), parâmetros
    formatados em árvore, seções de erro e de renderização.
  - **Raw limpo**: as linhas cruas do log, coloridas por categoria.
- Filtro por categoria (Tudo / Requisições / SQL / Renderização / Erros e avisos), busca textual,
  botão "carregar mais antigas", e os botões Atualizar, Exportar, Limpar e Pausar/Retomar.
- Um aviso informando que segredos são mascarados automaticamente.

## Como funciona por trás

- O dashboard lê apenas o **final** do arquivo de log (por padrão, os últimos 64 KB; no máximo
  256 KB por requisição) — ele nunca carrega o arquivo inteiro de uma vez.
- A tela se atualiza sozinha a cada **2 segundos** enquanto não estiver pausada; não é um
  streaming contínuo, é uma releitura periódica.
- **Limpar** apaga o conteúdo do arquivo de log (não afeta o processo em execução, só o histórico
  de saída acumulado).
- **Mascaramento de segredos**: antes de qualquer linha de log chegar ao navegador, o dashboard
  procura por padrões conhecidos de credencial — atribuições do tipo `api_key=...`, `password=...`,
  `token: "..."`, cabeçalhos `Bearer <token>`, credenciais embutidas em URL (`usuario:senha@host`)
  e formatos conhecidos de token (GitHub, chaves no estilo `sk-...`) — e substitui o valor
  encontrado por `[CONTEUDO_MASCARADO]`. Isso acontece **na resposta enviada ao navegador**; o
  arquivo em disco continua com o conteúdo original. A interface mostra quantas ocorrências foram
  mascaradas.
- A leitura estruturada de "Requisições" para logs Rails é feita inteiramente no navegador, sobre
  o texto já mascarado — o dashboard reconhece o padrão de linhas de uma requisição Rails
  (`Started GET ...`, `Processing by ...`, tempo de SQL, `Completed 200 ...`) e agrupa tudo isso em
  um cartão por requisição.

## Retenção

Os mesmos 7 dias de retenção do gerenciamento de processos (ver aba Servidor) valem para os
arquivos de log: registros órfãos ou antigos demais são removidos automaticamente antes de cada
novo início de servidor.
