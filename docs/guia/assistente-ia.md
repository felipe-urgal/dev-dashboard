# Guia da aba Assistente IA

> Parte do [Guia passo a passo do dashboard web](README.md).

Pede a um modelo de IA local (via [Ollama](https://ollama.com), rodando na própria máquina) para
implementar uma mudança descrita em linguagem natural. A IA pesquisa o projeto sozinha, propõe uma
prévia de arquivos alterados e só escreve algo em disco depois de você aprovar explicitamente.

## O que aparece na tela

- **Campo de solicitação**: uma área de texto (até 8.000 caracteres) para descrever o que você quer
  implementar, e um seletor do modelo Ollama instalado localmente que será usado.
- **Atividade ao vivo**: lista em tempo (quase) real das ferramentas que a IA está usando —
  consultar um arquivo, buscar texto no projeto, listar arquivos, olhar o diff do Git, consultar
  definição/referências de símbolo — e a resposta em texto que a IA vai produzindo.
- **Prévia de alterações**: a lista de arquivos que a IA propõe modificar, com o botão **Aprovar
  alterações** liberado só depois que a execução termina com sucesso.
- Um aviso de que você pode sair da aba: a execução continua rodando em segundo plano e retoma o
  acompanhamento sozinha ao voltar.

## Como funciona

- Ao clicar em **Iniciar**, a API cria uma execução (`POST /projects/:projectId/ai/implementations`)
  vinculada ao projeto e ao modelo escolhido; o frontend consulta o estado dessa execução por
  polling (a cada 1,5s) enquanto ela estiver em `running`.
- A IA tem acesso só a um catálogo fechado de ferramentas somente leitura sobre o projeto —
  `read_project_file`, `search_project_text`, `list_project_files`, `get_git_diff`,
  `get_symbol_definition`, `get_symbol_references` — mais uma ferramenta de escrita,
  `propose_workspace_edit`, que não grava nada: apenas monta uma **prévia** com o conteúdo antes e
  depois de cada arquivo afetado.
- Uma execução termina em um dos estados `succeeded`, `failed` ou `cancelled`. Só uma execução
  `succeeded` libera o botão de aprovação; o botão **Cancelar execução** interrompe uma execução
  `running` a qualquer momento.
- Reiniciar a API cancela qualquer execução em andamento — nada fica persistido em disco além do
  histórico de eventos da execução atual.

## Aprovar e aplicar a prévia

- A prévia (`workspace-edit-proposed`) vem acompanhada de um `confirmationToken` de uso único, com
  validade de 5 minutos.
- Clicar em **Aprovar alterações** chama `POST` com esse token; a API confere que o conteúdo atual
  de cada arquivo ainda bate com a versão vista na hora da prévia (`beforeVersion`) antes de
  escrever — se algo mudou nesse intervalo, a aplicação é recusada em vez de sobrescrever uma edição
  concorrente.
- Um token expirado ou já usado é rejeitado; não é possível reaplicar a mesma prévia duas vezes.

## Modelos recomendados

O painel também oferece instalar (`ollama pull`) um dos modelos recomendados diretamente pelo
dashboard, com progresso via stream:

| Modelo | Perfil |
|---|---|
| `qwen2.5-coder:7b` | Leve — resposta rápida para revisões curtas. |
| `qwen2.5-coder:14b` | Recomendado — melhor equilíbrio para revisão de Pull Request. |
| `devstral:24b` | Avançado — mais profundo, indicado para máquina forte. |

Se o Ollama não estiver disponível na máquina local, a aba mostra a mensagem de indisponibilidade
retornada pela API em vez do formulário de solicitação.

## Limites e privacidade

- Nenhum prompt ou resposta do assistente é persistido em log ou arquivo — tudo vive só na memória
  da execução em andamento.
- A IA nunca recebe permissão para rodar comandos de shell ou processos; seu único poder de escrita
  é propor uma prévia sujeita à aprovação explícita descrita acima.
