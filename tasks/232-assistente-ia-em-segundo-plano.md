# Task 232 — Assistente IA em segundo plano

**Status:** concluída em 2026-08-10. **Removida em 2026-08-12** — a aba
Assistente IA e a infraestrutura de seleção de provider/consentimento cloud
foram removidas por decisão explícita do usuário; ver
[`238-remover-assistente-ia.md`](238-remover-assistente-ia.md). Documento
mantido como registro histórico da entrega original.

## Objetivo

Adicionar uma área principal para pedir ajuda de implementação à IA local,
separada do **Code review IA** do Git, sem perder uma execução ao navegar por
outras abas do projeto.

## Resultado

- foi criada a aba principal **Assistente IA** nas ferramentas do projeto;
- o pedido inicia uma execução mantida pela API, independente da conexão da
  página, e a tela recupera seu snapshot ao voltar para a aba;
- enquanto houver execução ativa, um atalho flutuante **IA trabalhando** abre
  rapidamente o painel;
- a atividade mostra ferramentas consultadas, resposta e estado da execução;
- mudanças sugeridas aparecem como prévia de arquivos e só podem ser aplicadas
  após a conclusão e a confirmação explícita da pessoa usuária;
- iniciar um novo pedido para o mesmo projeto cancela a execução anterior;
- o estado é intencionalmente efêmero: a execução não sobrevive ao restart da
  API e nenhum histórico de prompts é gravado.

## Decisões e segurança

A API expõe somente IDs conhecidos de projeto, modelo e prompt limitado. Não
há shell, caminho arbitrário ou escrita automática. O modelo continua restrito
ao catálogo de ferramentas do `AiAssistantService`; o `WorkspaceEdit` segue
validando caminhos, versões e token de confirmação antes da escrita.

## Limitações

O acompanhamento usa consulta periódica curta apenas enquanto a execução está
ativa. O histórico não é persistido e a execução é cancelada quando a API é
encerrada.

## Validação

- `npm run typecheck`;
- `node --import=tsx --test apps/api/test/ai-implementation-execution-service.test.ts`;
- validações completas registradas na Pull Request.
