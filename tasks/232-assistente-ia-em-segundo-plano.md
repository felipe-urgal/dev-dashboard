# Task 232 â Assistente IA em segundo plano

**Status:** concluÃ­da em 2026-08-10. **Removida em 2026-08-12** â a aba
Assistente IA e a infraestrutura de seleÃ§Ã£o de provider/consentimento cloud
foram removidas por decisÃ£o explÃ­cita do usuÃ¡rio; ver
[`238-remover-assistente-ia.md`](238-remover-assistente-ia.md). Documento
mantido como registro histÃ³rico da entrega original.

## Objetivo

Adicionar uma Ã¡rea principal para pedir ajuda de implementaÃ§Ã£o Ã  IA local,
separada do **Code review IA** do Git, sem perder uma execuÃ§Ã£o ao navegar por
outras abas do projeto.

## Resultado

- foi criada a aba principal **Assistente IA** nas ferramentas do projeto;
- o pedido inicia uma execuÃ§Ã£o mantida pela API, independente da conexÃ£o da
  pÃ¡gina, e a tela recupera seu snapshot ao voltar para a aba;
- enquanto houver execuÃ§Ã£o ativa, um atalho flutuante **IA trabalhando** abre
  rapidamente o painel;
- a atividade mostra ferramentas consultadas, resposta e estado da execuÃ§Ã£o;
- mudanÃ§as sugeridas aparecem como prÃ©via de arquivos e sÃ³ podem ser aplicadas
  apÃ³s a conclusÃ£o e a confirmaÃ§Ã£o explÃ­cita da pessoa usuÃ¡ria;
- iniciar um novo pedido para o mesmo projeto cancela a execuÃ§Ã£o anterior;
- o estado Ã© intencionalmente efÃªmero: a execuÃ§Ã£o nÃ£o sobrevive ao restart da
  API e nenhum histÃ³rico de prompts Ã© gravado.

## DecisÃµes e seguranÃ§a

A API expÃµe somente IDs conhecidos de projeto, modelo e prompt limitado. NÃ£o
hÃ¡ shell, caminho arbitrÃ¡rio ou escrita automÃ¡tica. O modelo continua restrito
ao catÃ¡logo de ferramentas do `AiAssistantService`; o `WorkspaceEdit` segue
validando caminhos, versÃµes e token de confirmaÃ§Ã£o antes da escrita.

## LimitaÃ§Ãµes

O acompanhamento usa consulta periÃ³dica curta apenas enquanto a execuÃ§Ã£o estÃ¡
ativa. O histÃ³rico nÃ£o Ã© persistido e a execuÃ§Ã£o Ã© cancelada quando a API Ã©
encerrada.

## ValidaÃ§Ã£o

- `npm run typecheck`;
- `node --import=tsx --test apps/api/test/ai-implementation-execution-service.test.ts`;
- validaÃ§Ãµes completas registradas na Pull Request.
