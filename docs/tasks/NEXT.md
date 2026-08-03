# Próxima atividade

A task 077 concluiu a base segura de edição para arquivos de texto: salvamento
versionado, operações estruturais separadas, watcher limitado aos arquivos
abertos, comparação em três vias e `WorkspaceEdit` textual com preview e
rollback.

## Task 078 — LSP JavaScript/TypeScript

Conectar o Monaco a um servidor de linguagem JavaScript/TypeScript iniciado e
gerenciado pela API local, sem expor processos arbitrários ao navegador.

### Objetivo

Oferecer diagnóstico, definição, referências, hover, símbolos e autocomplete
semântico nos arquivos JavaScript e TypeScript do projeto, preservando a
fronteira de segurança já adotada pelo editor.

### Escopo proposto

- integrar `monaco-languageclient` ao frontend;
- adicionar gateway WebSocket autenticado com mensagens JSON-RPC;
- iniciar o servidor de linguagem somente sob demanda para projetos compatíveis;
- usar catálogo fechado de executável e argumentos;
- não instalar dependências ou servidores automaticamente;
- limitar um processo por projeto e encerrar por inatividade;
- reiniciar de forma controlada após falha, com limite de tentativas;
- mapear os modelos Monaco por URI canônica do workspace;
- sincronizar abertura, alteração, fechamento e salvamento dos documentos;
- exibir diagnósticos no Monaco e um resumo acessível por arquivo;
- habilitar hover, definição, referências, símbolos e completion;
- validar `WorkspaceEdit` retornado pelo servidor;
- aceitar apenas alterações textuais em arquivos permitidos e existentes;
- exigir preview e confirmação no fluxo seguro da task 077;
- bloquear `workspace/executeCommand` por padrão;
- mostrar estado do servidor de linguagem sem transformar a tela em console.

### Segurança

- o navegador nunca escolhe executável, cwd ou argumentos;
- o processo usa a raiz canônica do projeto já autorizado;
- mensagens WebSocket exigem a mesma sessão local autenticada da API;
- caminhos recebidos do LSP são revalidados contra a raiz e as exclusões do
  editor;
- arquivos sensíveis, binários e grandes permanecem indisponíveis;
- comandos arbitrários, instalação automática e terminal continuam bloqueados;
- alterações propostas não são gravadas sem revisão explícita.

### Critérios principais

- TypeScript e JavaScript recebem diagnóstico sem recarregar a página;
- go to definition e referências funcionam entre arquivos permitidos;
- autocomplete semântico complementa, sem remover, o suporte nativo do Monaco;
- fechamento da última sessão ociosa encerra o processo correspondente;
- falha do LSP degrada o editor para Monaco local sem impedir leitura e escrita;
- `WorkspaceEdit` inválido, estrutural ou fora da raiz é recusado;
- nenhum comando do servidor é executado automaticamente;
- typecheck, build, testes de API, testes web e smoke E2E passam.

### Fora do escopo

- Ruby/Rails LSP, planejado para a task 079;
- assistência de IA local, planejada para a task 080;
- completion inline/FIM e contexto semântico, planejados para a task 081;
- terminal livre, extensões arbitrárias e instalação automática de ferramentas.
