# Estado assíncrono e realtime no frontend

O frontend mantém a apresentação separada da infraestrutura que atualiza estado vivo. Quando mais de um componente observa o mesmo recurso de um projeto, o ciclo de atualização não deve ser recriado em cada view.

## Escolha do mecanismo

Use o mecanismo mais simples que represente a fonte de dados com honestidade:

- **snapshot**: uma leitura pontual para dados que só precisam ser atualizados por navegação ou ação explícita;
- **stream (SSE/WS)**: preferido quando o backend já oferece eventos para aquele domínio e a atualização precisa acompanhar mudanças continuamente;
- **polling**: fallback explícito para estado vivo sem stream disponível. O intervalo pertence à camada de estado, não ao componente que renderiza a informação.

Polling não deve ser adicionado globalmente apenas para deixar uma tela “mais atual”. Ele precisa ter consumidores ativos, intervalo conhecido e lifecycle de parada definido.

## Registry de snapshots por projeto

`apps/web/src/stores/project-live-state.ts` coordena subscriptions por chave `projectId + domínio`.

O registry garante que:

- consumidores da mesma chave compartilham a mesma leitura e o mesmo timer;
- o snapshot mais recente é entregue a novos consumidores da chave ativa;
- o polling existe somente enquanto há pelo menos um consumidor;
- respostas de um lifecycle já encerrado são descartadas por geração;
- erro temporário é publicado como estado explícito e o próximo ciclo pode recuperar o snapshot;
- componentes recebem `loading`, `ready` ou `error`, sem implementar timer, retry ou controle de resposta stale.

## Piloto: Git durante Produção

A tela de detalhes precisa manter o overview de Git atualizado enquanto a rota de Produção está aberta, pois branch e revision participam da decisão visual do fluxo.

Esse domínio usa polling de 3 segundos porque ainda não possui um stream específico. `ProjectDetailsView.vue` apenas assina `subscribeProjectGitOverview` ao entrar em Produção e encerra a assinatura ao trocar de rota, projeto ou desmontar. O timer, deduplicação, retry após erro e descarte de respostas obsoletas ficam no registry.

Leituras pontuais de Git usadas no carregamento inicial continuam snapshots normais. A existência do registry não transforma toda chamada HTTP em estado realtime.
