# Guia da aba Logs

> Parte do [Guia passo a passo do dashboard web](README.md).

Mostra a saída do servidor de desenvolvimento (a mesma que apareceria no terminal, se você tivesse
rodado o comando manualmente), com filtros, busca e uma leitura especial para projetos Rails.

## O que aparece na tela

- Uma faixa curta de status: servidor ativo ou pausado, endereço local e quantidade de eventos
  visíveis.
- Duas formas de visualizar:
  - **Fluxo**: uma linha por evento ou requisição Rails, em ordem cronológica. Cada linha mostra
    horário, método, rota, status e duração. Ao selecionar uma requisição, aparecem o controller,
    o tempo, a quantidade de queries e detalhes recolhidos de SQL, parâmetros e log completo.
  - **Diagnóstico**: erros, lentidão, possível N+1 e SQL repetida, com a investigação detalhada
    disponível quando necessária.
- Filtro por categoria (Tudo / Requisições / SQL / Renderização / Erros e avisos), busca textual,
  botão "carregar eventos mais antigos", Pausar/Retomar e um menu de mais ações para Atualizar,
  Exportar e Limpar.
- Um aviso informando que segredos são mascarados automaticamente.

## Como funciona por trás

- O dashboard lê apenas o **final** do arquivo de log (por padrão, os últimos 64 KB; no máximo
  256 KB por requisição) — ele nunca carrega o arquivo inteiro de uma vez.
- A tela acompanha o log por push (Server-Sent Events), não por releitura periódica: o servidor
  reconsulta o arquivo por trás e só envia uma atualização ao navegador quando o conteúdo muda —
  novas linhas aparecem assim que são escritas, sem esperar um intervalo fixo. Pausar fecha essa
  conexão; Retomar abre uma nova. A ação "Atualizar" do menu continua fazendo uma busca avulsa,
  independente do acompanhamento contínuo.
- **Limpar** apaga o conteúdo do arquivo de log (não afeta o processo em execução, só o histórico
  de saída acumulado).
- **Mascaramento de segredos**: antes de qualquer linha de log chegar ao navegador, o dashboard
  procura por padrões conhecidos de credencial — atribuições do tipo `api_key=...`, `password=...`,
  `token: "..."`, cabeçalhos `Bearer <token>`, credenciais embutidas em URL (`usuario:senha@host`)
  e formatos conhecidos de token (GitHub, chaves no estilo `sk-...`) — e substitui o valor
  encontrado por `[CONTEUDO_MASCARADO]`. Isso acontece **na resposta enviada ao navegador**; o
  arquivo em disco continua com o conteúdo original. A interface mostra quantas ocorrências foram
  mascaradas.
- A leitura estruturada do fluxo para logs Rails é feita inteiramente no navegador, sobre
  o texto já mascarado — o dashboard reconhece o padrão de linhas de uma requisição Rails
  (`Started GET ...`, `Processing by ...`, tempo de SQL, `Completed 200 ...`) e agrupa tudo isso em
  um evento expansível por requisição.

## Retenção

Os mesmos 7 dias de retenção do gerenciamento de processos (ver aba Servidor) valem para os
arquivos de log: registros órfãos ou antigos demais são removidos automaticamente antes de cada
novo início de servidor.
