# Guia da aba Assistente IA

> Parte do [Guia passo a passo do dashboard web](README.md).

A aba Assistente IA pede a um modelo de IA para implementar uma mudança descrita em linguagem natural. O projeto pode usar **Local (Ollama)** ou **OpenAI (Cloud)**, conforme a seleção persistida para aquele projeto.

A IA pesquisa o projeto, propõe uma prévia de arquivos alterados e só escreve algo em disco depois de aprovação explícita.

## O que aparece na tela

- **Executar com**: provider selecionado para o projeto (`Local` ou `OpenAI`).
- **Modo**: `Rápido` ou `Completo`.
- **Campo de solicitação**: área de texto de até 8.000 caracteres para descrever a mudança desejada.
- **Modelo**: lista compatível com o provider selecionado.
- **Fallback**: preferência da sessão entre não oferecer alternativa (`off`) e oferecer outro provider disponível (`offer`). Não existe fallback automático.
- **Atividade ao vivo**: ferramentas usadas pela IA e resposta produzida durante a execução.
- **Prévia de alterações**: arquivos que a IA propõe modificar; só uma execução concluída com sucesso libera a aprovação.
- **Estado da execução**: provider, modo, modelo, andamento, falha ou cancelamento.

A execução continua em segundo plano enquanto a API permanecer ativa; é possível sair da aba e voltar depois.

## Seleção Local / OpenAI

A seleção de provider e modo é persistida por projeto.

### Local

Usa `OllamaProvider` e os modelos instalados localmente.

### OpenAI

Usa `OpenAiProvider` e exige:

1. API key configurada no processo da API;
2. provider disponível;
3. consentimento explícito para aquele projeto;
4. modelo compatível com o provider.

Selecionar OpenAI não concede consentimento automaticamente.

A consulta de status/modelos pode acontecer sem consentimento porque não envia código do projeto. O consentimento é exigido antes de conteúdo do workspace seguir para cloud.

Se a API da OpenAI estiver sem créditos/quota, o dashboard mostra uma mensagem orientando adicionar créditos da API ou selecionar o provider Local. Assinatura do ChatGPT não é usada como saldo da API.

## Como funciona uma execução

Ao clicar em **Iniciar**, a API cria uma execution em:

`POST /projects/:projectId/ai/implementations`

A execution registra:

- projeto;
- provider;
- modo;
- modelo;
- prompt;
- status;
- timestamps;
- eventos.

Provider e modo são congelados no início. Trocar a seleção depois não muda a execução em andamento.

O frontend consulta o snapshot da execution enquanto ela estiver `running`.

Uma execução termina em:

- `succeeded`;
- `failed`;
- `cancelled`.

O botão **Cancelar execução** interrompe uma execução `running`.

## Investigação obrigatória do projeto

Para pedidos sobre código existente, o Assistente deve investigar o projeto antes de concluir a resposta.

O catálogo atual inclui:

- `read_project_file`;
- `search_project_text`;
- `list_project_files`;
- `get_git_diff`;
- `get_symbol_definition`;
- `get_symbol_references`;
- `propose_workspace_edit`.

Quando o pedido menciona uma tela, funcionalidade ou diretório sem informar o arquivo exato, o Assistente deve localizar o código com busca/listagem antes de sugerir a alteração.

Ele não pode inventar caminhos. Se uma leitura falhar, deve voltar a buscar/listar o projeto.

Uma resposta final sobre alteração concreta sem inspeção bem-sucedida é recusada. `propose_workspace_edit` também é bloqueado antes dessa inspeção.

## Prévia e aplicação

`propose_workspace_edit` não escreve no disco. A ferramenta cria uma prévia com conteúdo anterior e posterior.

A prévia (`workspace-edit-proposed`) inclui um `confirmationToken` temporário e vinculado à operação.

Ao aprovar:

- a API revalida a versão atual de cada arquivo;
- se o conteúdo mudou desde a prévia, a aplicação é recusada;
- token expirado ou já utilizado é rejeitado;
- nenhuma alteração é aplicada silenciosamente pela IA.

## Modos Rápido e Completo

### Rápido (`fast`)

Usa budgets menores de contexto e rodadas. É indicado para tarefas pontuais e menor latência/custo.

### Completo (`complete`)

Permite mais contexto, mais rodadas de ferramentas e análise mais profunda dentro dos limites definidos pela aplicação.

O modo é independente do provider.

## Modelos

A UI mostra apenas os modelos descobertos para o provider selecionado, e o backend valida novamente antes da inferência.

Isso significa que uma request manual não consegue usar, por exemplo:

- um modelo Ollama com OpenAI;
- um modelo OpenAI com Ollama.

### Instalação local

Quando o provider selecionado suporta instalação de modelo, o dashboard pode instalar modelos recomendados localmente com progresso por stream.

Modelos recomendados para Ollama incluem:

| Modelo | Perfil |
|---|---|
| `qwen2.5-coder:7b` | Leve — menor uso de recursos. |
| `qwen2.5-coder:14b` | Recomendado — bom equilíbrio para programação. |
| `devstral:24b` | Avançado — indicado para máquina com mais recursos. |

Provider cloud não cai silenciosamente no Ollama ao usar `models/pull`.

## Tool calling no Ollama

Nem todo modelo local segue de forma confiável o mecanismo estruturado de tool-calling.

O adapter Ollama possui uma camada de compatibilidade para chamadas de ferramenta escritas como JSON textual, mas somente quando a ferramenta pertence ao catálogo autorizado enviado naquela solicitação. Ferramentas desconhecidas continuam recusadas.

Esse comportamento é específico do adapter Ollama e não afeta o contrato multi-provider.

## Fallback

A política atual não executa outro provider automaticamente.

Com `offer`, após uma falha elegível a interface pode oferecer outro provider disponível. Aceitar a oferta apenas troca a seleção; uma nova execução ainda depende de ação explícita em **Iniciar**.

Local → OpenAI continua exigindo consentimento cloud.

A nova execução não reaproveita histórico, tool results ou eventos da execução anterior.

## Limites e privacidade

- Conteúdo textual passa pela mesma barreira de masking antes de alcançar um provider.
- A proteção cobre mensagens, resultados de ferramentas e contexto de completion.
- Credenciais da OpenAI ficam no processo da API e não são inseridas em prompts ou eventos.
- Requests OpenAI de inferência usam `store: false`.
- A IA não recebe shell arbitrário.
- O único poder de escrita é propor uma prévia sujeita à aprovação explícita.
- Reiniciar a API cancela executions em andamento mantidas apenas em memória.

Para detalhes arquiteturais, veja [`../architecture/ai-multi-provider.md`](../architecture/ai-multi-provider.md).
