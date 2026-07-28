# Próxima atividade — 039: Avisos locais de conclusão

## Contexto

A task 035 inaugurou a tela de configurações com retenção limitada e
persistida. Após as reformas das páginas de processos e atividade nas
tasks 036 e 037, o item seguinte do Horizonte 2 é avisar conclusões de
operações demoradas sem transformar a API em um emissor remoto nem
exigir permissões do sistema operacional.

## Objetivo

Criar notificações visuais locais, acessíveis e limitadas para conclusões
de testes, scripts e processos acompanhados pelo dashboard.

## Plano detalhado

1. Inventariar feedbacks atuais e eventos SSE já disponíveis, evitando
   polling ou um segundo canal de eventos.
2. Definir um store client-side limitado e deduplicado, sem persistir
   logs, caminhos ou conteúdo sensível.
3. Criar região `aria-live` e central de avisos com estado vazio, leitura
   e descarte.
4. Publicar somente transições terminais observadas na sessão atual e
   vincular cada aviso à tela autorizada correspondente.
5. Cobrir deduplicação, limite, acessibilidade, troca de projeto e
   reconexão SSE com testes montados; atualizar o smoke de navegação se a
   fixture for determinística.

## Segurança

- Não incluir conteúdo de log, comando, caminho ou segredo no aviso.
- Não adicionar endpoint nem persistência nesta fatia.
- Não solicitar permissão de notificação do sistema operacional.
- Tratar eventos recuperados após reconexão sem notificá-los
  repetidamente.

## Fora do escopo

- Push, e-mail, webhook e notificações nativas do sistema.
- Histórico de auditoria novo.
- Configuração remota ou multiusuário.

## Critérios de aceite

- conclusões novas geram um único aviso compreensível;
- avisos são navegáveis e anunciados por tecnologia assistiva;
- payload sensível não é armazenado nem exibido;
- a lista possui limite fechado e pode ser limpa;
- `npm run typecheck`, `npm run build` e `npm test` passam.
