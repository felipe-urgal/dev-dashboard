# Dev Dashboard ChatGPT Browser — Chrome/Chromium Extension

Extensão Manifest V3 do `@dev-dashboard/agent-runtime` para executar jobs do provider `chatgpt-browser` em uma conversa nova do ChatGPT.

## Segurança

- acessa somente `https://chatgpt.com/*` e `http://127.0.0.1/*`;
- não lê cookies nem tokens da sessão ChatGPT;
- não recebe `cwd` nem paths absolutos dos repositórios;
- operações locais passam apenas pelos envelopes estruturados do Browser Bridge;
- mutações interrompidas permanecem ambíguas e não são repetidas automaticamente.

## Carregar a extensão

1. Inicie o Dev Dashboard com o Browser Bridge disponível.
2. Abra `chrome://extensions` no Chrome/Chromium.
3. Habilite **Developer mode**.
4. Use **Load unpacked** e selecione `packages/agent-runtime/browser-extension`.
5. Abra as opções da extensão.
6. Cole o token gerado em `<stateDir>/browser/token` e mantenha a porta padrão `43821`, salvo configuração explícita diferente.

O token fica somente no `chrome.storage.local` da extensão e é enviado apenas ao loopback.

## Estado da sessão

O service worker envia heartbeat com `available | unavailable | unknown`. O provider usa esse estado para diferenciar bridge indisponível, extensão ausente/stale e sessão ChatGPT indisponível.

## Protocolo

A conversa usa exatamente um bloco executável `agent-workflow-browser` por turno. `tool_request` é executado pelo bridge e o resultado volta para a conversa; a execução termina somente com `terminal_result` válido.

A validação automatizada cobre proteção contra reenvio após restart, loop multi-tool e recuperação exactly-once no bridge. A validação live com Chrome/Chromium e sessão autenticada continua sendo um gate separado.
