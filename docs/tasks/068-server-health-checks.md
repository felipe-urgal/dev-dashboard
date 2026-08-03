# Task 068 — Health checks locais declarativos

## Status

Concluída.

## Objetivo

Transformar o estado do servidor em um sinal operacional real, verificando um
endpoint HTTP local sem aceitar URL absoluta, host, porta, headers ou corpo
livres do navegador.

## Escopo entregue

- detecção automática, nesta ordem, de `/up`, `/health`, `/healthz` e `/`;
- caminho relativo opcional persistido por projeto nas configurações do
  servidor, com limite de 128 caracteres e validação que recusa URL absoluta,
  query string, fragmento, barras duplas e segmentos `.`/`..`;
- nova rota privada `GET /api/projects/:projectId/server-health`, que resolve a
  porta somente a partir do processo gerenciado ou da configuração persistida;
- requisição `GET` exclusivamente para `127.0.0.1`, com `Host: localhost`,
  timeout de 2 segundos, sem cookies, credenciais, corpo ou redirecionamento;
- classificação de `2xx` como saudável, `3xx` como degradado e demais códigos,
  timeout ou falha de conexão como indisponível;
- resposta limitada a caminho, origem do caminho, classificação, status HTTP,
  latência, horário e mensagem segura — sem corpo ou headers do projeto;
- painel do servidor com configuração do caminho, status, latência, código
  HTTP, última verificação e atualização manual;
- polling a cada 15 segundos somente enquanto o servidor está rodando e o
  painel está montado, com invalidação ao trocar de projeto ou sair da tela.

## Decisões de segurança

- a API sempre fixa o destino em `127.0.0.1` e usa apenas a porta já resolvida
  internamente; o navegador nunca envia host, porta ou URL para a verificação;
- a implementação usa `node:http` com redirecionamento desativado por natureza;
  uma resposta `3xx` é classificada e não seguida;
- o corpo da resposta é descartado assim que os headers chegam, evitando
  armazenar ou devolver conteúdo potencialmente sensível e impondo um limite
  efetivo de zero bytes de payload;
- erros de rede são resumidos em português e detalhes como endereço, stack ou
  `ECONNREFUSED` não atravessam o contrato público;
- o health check só roda para um processo gerenciado em estado `running`.

## Critérios de aceite

- nenhum destino externo pode ser composto a partir da entrada do navegador;
- caminho configurado inválido é recusado antes da persistência;
- `2xx`, `3xx` e falhas recebem classificações distintas;
- o polling para quando o servidor deixa de rodar ou o painel é desmontado;
- troca de projeto invalida respostas pendentes;
- o painel mostra caminho, HTTP, latência e horário da verificação.

## Validação

- `npm run typecheck` passou em todos os workspaces;
- `npm run build` passou para packages, API e frontend;
- testes focados novos passaram: serviço de health check (3), rota (1),
  persistência/validação (2) e painel Vue (1);
- suíte completa: scripts (6), API (341), web (260), core (8) e
  project-discovery (1) passaram;
- `process-manager`: 38 passaram e 13 falharam por limitações conhecidas do
  ambiente isolado (`os.networkInterfaces()`, processos destacados e
  temporização de locks); o teste novo de configurações passou e nenhuma falha
  percorre o health check.

## Limitações

- a primeira versão suporta somente HTTP local; HTTPS local e health checks por
  comando permanecem fora do escopo;
- a detecção não persiste automaticamente o caminho encontrado; ela o redetecta
  até o usuário optar por salvar um caminho explícito;
- não há histórico de verificações nem alertas quando o estado muda;
- o polling existe apenas na aba Servidor aberta e não vira monitoramento em
  segundo plano.

## PR

[#149 — Adiciona health checks locais declarativos](https://github.com/felipe-urgal/dev-dashboard/pull/149)
