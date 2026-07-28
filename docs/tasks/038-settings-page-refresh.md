# Task 038 — Reforma de Configurações e alertas temporários

## Status

Concluída.

## Objetivo

Melhorar a leitura e a operação da página `/settings`, preservando os
limites seguros da API, e impedir que feedbacks transitórios permaneçam
indefinidamente nas telas do dashboard.

## Escopo entregue

- Cabeçalho compacto com ação de salvamento e indicação de alterações
  pendentes.
- Formulário organizado entre arquivos locais e limites dos históricos.
- Controles numéricos com unidades, limites e descrições explícitas.
- Resumo imediato da política configurada para logs, scripts e testes.
- Aviso operacional persistente de que salvar não remove arquivos e de
  que os valores passam a valer após reiniciar a API.
- Composable compartilhado que fecha feedbacks de sucesso e erro após
  cinco segundos e reinicia o prazo quando a mensagem muda.
- Aplicação do descarte automático nos alertas do dashboard, workspaces,
  processos, atividade, Git, banco, scripts, testes, servidor, seleção
  de diretórios, command palette e Configurações.

## Decisões

- O aviso de reinício permanece visível porque é orientação necessária
  ao formulário, não um alerta transitório.
- Alertas continuam acessíveis por `role="alert"` ou `role="status"` e
  os controles manuais existentes permanecem disponíveis enquanto a
  mensagem estiver na tela.
- O temporizador é cancelado no descarte ou desmontagem do componente,
  evitando atualizações depois que a tela deixa de existir.
- O botão de salvar só fica habilitado quando os valores diferem do
  snapshot confirmado pela API.

## Testes

- `apps/web/test/settings-view.test.ts` cobre carregamento, estado
  alterado, salvamento, reinício exigido e descarte automático.
- `apps/web/test/use-auto-dismiss.test.ts` cobre o prazo e seu reinício
  quando uma nova mensagem substitui a anterior.
- A suíte web concluiu 81 testes.

## Verificação

```text
npm --workspace @dev-dashboard/web run typecheck
npm --workspace @dev-dashboard/web test
XDG_CONFIG_HOME=<temporário> XDG_STATE_HOME=<temporário> \
  npm --workspace @dev-dashboard/web run build
```

- Typecheck concluído.
- 81 testes concluídos.
- Build de produção concluído com diretórios temporários de
  configuração e estado.
- A prévia em navegador foi comparada ao mock escolhido.
- Alteração, salvamento e desaparecimento do feedback foram verificados.
- Nenhum erro ou aviso originado pela aplicação foi encontrado no
  console; as mensagens existentes pertenciam à extensão do navegador.

## Limitações

- O prazo é único e local ao frontend; não há persistência nem novo
  endpoint para alertas.
- Estados vazios ou erros que substituem o conteúdo integral de uma
  página não são tratados como alertas transitórios.
