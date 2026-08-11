# Experiência compartilhada de logs

O dashboard adota duas camadas para saídas de processos e comandos:

- **Fluxo / Execução / Saída**: leitura normal, densa e cronológica, com o evento mais recente no final e acompanhamento automático enquanto a pessoa permanece próxima ao fim.
- **Diagnóstico**: triagem de sinais que merecem atenção antes de mostrar os detalhes completos. Erros, avisos, lentidão, retries e padrões repetidos são apresentados como problemas investigáveis.

A regra de produto é **conclusão antes de evidência**: o dashboard destaca primeiro o que parece errado e só então expõe stack trace, SQL, parâmetros, renderização ou o trecho bruto relacionado.

## Aplicação por ferramenta

| Ferramenta               | Visão normal          | Diagnóstico                                         |
| ------------------------ | --------------------- | --------------------------------------------------- |
| Logs do servidor         | Fluxo HTTP/Rails/Node | 5xx/exceptions, requests lentas, N+1 e SQL repetido |
| Sidekiq                  | Fluxo de jobs         | falhas, retries e jobs lentos                       |
| Webpack                  | Fluxo de compilação   | erros, warnings e builds lentos                     |
| Testes                   | Execução              | falhas, warnings e contexto do runner               |
| Scripts                  | Saída                 | erros, warnings e execução lenta                    |
| Dependências/build       | Saída                 | erros, warnings e build lento                       |
| Operações Rails de banco | Saída                 | erros e warnings do comando pontual                 |

O suporte a Docker Compose não faz parte desta entrega porque essa integração não existe mais no produto atual.

## Fluxo normal

- Uma linha por evento sempre que possível: para requests Rails, horário, método, rota, status e
  duração bastam na leitura inicial.
- Controller, quantidade de queries, SQL, parâmetros e o trecho completo do log aparecem somente
  após selecionar o evento. SQL começa recolhida para não dominar o fluxo.
- Pausar é a ação direta; atualizar, exportar e limpar ficam em um menu de mais ações.
- Busca e filtros sem transformar cada linha em um card.
- Auto-follow pelo final da saída, como em um terminal.
- Rolagem manual pausa o acompanhamento; voltar ao final permite retomar.
- Segredos continuam respeitando o mascaramento aplicado pela API.
- Logs grandes continuam limitados para preservar responsividade.

## Diagnóstico

O diagnóstico não tenta interpretar qualquer mensagem como certeza. Ele usa sinais conservadores e específicos do domínio, preservando o conteúdo original como evidência.

### Servidor Rails

A estrutura do log permite um diagnóstico mais rico:

- status 5xx e exceptions;
- request acima de 1 segundo;
- SQL agrupado por padrão;
- possível N+1;
- consulta repetida;
- tempos de Active Record, views e GC.

SQL, parâmetros, renderização e log completo começam recolhidos para que uma consulta extensa não domine a tela.

### Sidekiq

A visualização procura eventos de job, falhas, retries e duração elevada. JID, classe e fila continuam pesquisáveis no fluxo original.

### Webpack

Compilação, conclusão, warnings e errors recebem classificação sem alterar a saída original. Builds acima do limiar configurado pelo parser aparecem como lentos.

### Testes

**Descrição histórica, hoje não exposta pela aba Testes** (ver `docs/guia/testes.md`): o modo normal acompanha a execução. O modo Diagnóstico combina a classificação compartilhada com o navegador especializado de falhas já existente, mantendo expected/actual, arquivo, linha e contexto do runner quando disponíveis. Desde o PoC de terminal PTY (task 234, item 1) a aba Testes roda a suíte completa como saída de terminal cru (`xterm.js`), sem essa classificação — reconstruí-la sobre o novo modelo é trabalho futuro.

### Scripts, dependências e comandos pontuais

Como a saída pode pertencer a ferramentas arbitrárias, o diagnóstico é propositalmente conservador: erros, warnings e lentidão evidente. Não há tentativa de inferir semântica específica quando o formato não é conhecido.

## Implementação

`ProjectLogExperience.vue` fornece a composição compartilhada e `utils/log-experience.ts` concentra a classificação genérica. Ferramentas com estrutura própria podem manter um diagnóstico especializado, como o inspetor Rails dos logs do servidor, sem duplicar a linguagem visual e o comportamento do fluxo.

A implementação deve continuar respeitando os limites de renderização, cancelamento/streaming existentes e os contratos de segurança de cada ferramenta.

### Transporte: push via SSE, não polling

Logs do servidor e dos workers Rails (Sidekiq/webpack) chegam por push (Server-Sent Events), não
por polling do navegador — `apps/api/src/http/log-event-stream.ts` (`streamLogSnapshots`) reaproveita
a mesma leitura de arquivo já usada pelas rotas de leitura avulsa (`readManagedLog`/`readWorkerLog`),
só que o próprio servidor reconsulta a cada 1s e só emite um evento novo quando o conteúdo muda —
mesmo padrão que Testes/Scripts já usam (`apps/api/src/routes/scripts.ts`,
`apps/api/src/routes/tests/events-route.ts`). No frontend, `useProjectLogsPolling.ts` (servidor) e
`useProjectRailsWorker.ts` (Sidekiq/webpack) assinam esse stream via `followEventStream` em vez de
reconsultar em intervalo fixo; a ação manual "Atualizar" continua fazendo uma busca avulsa
(`fetchProjectProcessLog`/`fetchProjectRailsWorkerLog`), independente do stream.
