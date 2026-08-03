# Implementação inicial da IDE embutida

A fundação da IDE usa Monaco Editor `0.56.0` e permanece somente leitura.

## Integração web

- carregamento dinâmico do Monaco para não aumentar a entrada principal;
- workers dedicados via Vite para editor, JSON, CSS, HTML e TypeScript;
- um modelo por URI lógica `file:///dev-dashboard/projects/<id>/<path>`;
- descarte de modelos ao fechar aba, trocar projeto ou desmontar a página;
- explorer carregado sob demanda;
- busca limitada no backend;
- fallback textual quando o Monaco não inicializa.

## Fronteira da API

O `ProjectFileService` é a única camada que acessa arquivos para o editor. Ele
recebe a raiz recuperada pelo `ProjectStore`, canonicaliza caminhos, aplica
limites e nunca devolve o caminho absoluto ao navegador.

A escrita continua proibida até a task 077.
