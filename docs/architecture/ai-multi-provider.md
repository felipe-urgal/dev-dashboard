# Arquitetura multi-provider e modos de execução de IA

Este documento registra a direção arquitetural aprovada para a evolução do Assistente IA e da Code review IA do Dev Dashboard. Ele consolida a proposta inicial e as revisões técnicas realizadas antes da implementação.

A intenção é manter uma fonte única de verdade para as decisões, os limites e a ordem de execução. Rascunhos e revisões anteriores servem como histórico de discussão; as decisões registradas aqui prevalecem para a implementação.

## Objetivo

Separar duas decisões que hoje estão acopladas ao uso do Ollama local:

1. **qual provider/modelo executa a inferência**;
2. **como a tarefa deve ser executada**, com um modo simples de profundidade.

A evolução deve permitir, no futuro, escolher entre execução local e providers cloud sem mover para cada provider as regras de Git, arquivos, LSP, segurança, preview ou aprovação.

## Estado atual

O Assistente IA atual usa Ollama local diretamente dentro de `apps/api/src/services/ai-assistant-service.ts`.

Características relevantes do comportamento existente:

- `DEV_DASHBOARD_OLLAMA_URL` aceita somente HTTP em loopback;
- o chat interativo possui catálogo fechado de ferramentas;
- o modelo pode ler arquivos, buscar texto, consultar diff e símbolos;
- `propose_workspace_edit` apenas cria uma proposta de edição;
- a escrita só acontece depois de aprovação explícita;
- o loop de chat possui limite de rodadas de ferramentas;
- existe tratamento específico para modelos Ollama que retornam tool call como JSON textual;
- a Code review IA processa os arquivos do diff separadamente e agrega os achados ao final;
- o diff enviado por arquivo possui limite fixo;
- o mascaramento de segredos já é usado no fluxo de Code review, mas precisa ser garantido em qualquer caminho que venha a enviar conteúdo para providers externos.

## Princípios

1. **Local por padrão.** O Ollama continua sendo a opção local e privada.
2. **Provider não conhece o workspace.** Nenhum provider recebe acesso direto ao filesystem, Git, LSP ou serviços internos.
3. **Ferramentas pertencem ao Dev Dashboard.** O modelo solicita; a aplicação valida e executa.
4. **Escrita continua sujeita a preview e aprovação.** Nenhum provider grava arquivos diretamente.
5. **Sem shell irrestrito.** A evolução multi-provider não amplia a superfície de execução arbitrária.
6. **Cloud nunca é fallback silencioso do local.** A política inicial de fallback é `offer`.
7. **Segredos devem ser mascarados antes de qualquer envio externo.** Esse é um pré-requisito para providers cloud.
8. **Modos são policies testáveis.** `fast` e `complete` não podem depender apenas de descrições em prosa.
9. **Abstrações só nascem quando houver necessidade real.** Evitar criar vários componentes antecipadamente para um único provider.
10. **Documentação acompanha comportamento.** A introdução de provider cloud exige atualizar também a documentação de segurança e operação.

## Arquitetura alvo

A arquitetura deve evoluir de forma incremental. O desenho alvo é:

```text
                       AiProvider
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
          AiOrchestrator      GitAiCodeReviewService
           Assistente              Code Review
                │                     │
                └──────────┬──────────┘
                           │
                    ProviderResolver
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Ollama        Codex        Gemini
```

O desenho é alvo, não obrigação para a primeira implementação. `ProviderResolver`, seleção em UI e múltiplos providers só entram quando existir pelo menos um segundo provider real.

## `AiProvider`

O contrato compartilhado representa apenas capacidades de inferência e disponibilidade.

Exemplo conceitual:

```ts
interface AiProvider {
  id: string;
  status(): Promise<ProviderStatus>;
  listModels(): Promise<AiModel[]>;
  capabilities(model: string): AiCapabilities;
  chat(input: ProviderChatInput): AsyncIterable<ProviderEvent>;
  complete(input: ProviderCompletionInput): Promise<string>;
}
```

Capacidades compartilhadas podem incluir:

```ts
interface AiCapabilities {
  structuredTools: boolean;
  streaming: boolean;
  jsonOutput?: boolean;
  maxContext?: number;
}
```

Parâmetros específicos de fornecedor não devem aumentar o contrato comum a cada integração nova. Quando necessário, cada adaptador pode aceitar opções próprias validadas internamente, por exemplo:

```ts
providerOptions?: Record<string, unknown>;
```

Essas opções nunca devem ser repassadas sem validação pelo adaptador correspondente.

## `OllamaProvider`

O primeiro provider será uma extração do comportamento Ollama existente, sem mudança observável de produto.

Devem migrar para o `OllamaProvider`:

- chamadas HTTP específicas do Ollama;
- descoberta/listagem de modelos;
- descoberta de capacidades específicas do Ollama;
- serialização/deserialização do formato nativo de tool calling;
- compatibilidade com tool calls vazados como JSON textual;
- detalhes de timeout/opções específicos do Ollama.

O tratamento de tool call textual é compatibilidade do Ollama/modelo e não deve permanecer no orquestrador genérico.

## `AiOrchestrator`

O `AiOrchestrator` gerencia apenas o fluxo interativo do Assistente IA:

- histórico da conversa da execução;
- rodadas de ferramentas;
- validação do catálogo autorizado;
- execução das ferramentas existentes;
- budget de execução;
- detecção de ausência de progresso/loops;
- preview de alterações;
- integração com aprovação já existente.

Na primeira versão, `ContextBuilder` e `ToolExecutor` não precisam nascer como classes/serviços independentes. Eles só devem ser separados quando uma diferença concreta de comportamento, teste ou reutilização justificar essa divisão.

## Code review permanece separado

`GitAiCodeReviewService` não faz parte do `AiOrchestrator`.

O Assistente IA é uma sessão interativa com múltiplas rodadas de ferramentas. A Code review IA é um fluxo batch, por arquivo, com concorrência e posterior agregação. Os dois podem consumir o mesmo `AiProvider`, mas mantêm orquestrações distintas.

## Protocolo interno de ferramentas

O catálogo fechado existente continua sendo o protocolo interno do Dev Dashboard.

Exemplos:

- `read_project_file`;
- `search_project_text`;
- `list_project_files`;
- `get_git_diff`;
- `propose_workspace_edit`;
- `get_symbol_definition`;
- `get_symbol_references`.

Cada provider traduz o formato nativo de function/tool calling para esse catálogo. Não é necessário criar um “mínimo múltiplo comum” das APIs dos fornecedores.

Os argumentos recebidos do modelo devem continuar validados antes da execução. Se for introduzida validação por schema/Zod, ela deve proteger o protocolo interno e não acoplar serviços locais ao SDK de um fornecedor.

## Modos de execução

A UI deverá expor inicialmente dois modos:

- **Rápido (`fast`)**: menor custo/latência e análise pontual;
- **Completo (`complete`)**: mais contexto, maior budget e análise cruzada.

O comportamento deve ser definido por uma policy explícita e testável, não por `if` espalhados.

Exemplo conceitual:

```ts
interface AiExecutionPolicy {
  maxToolRounds: number;
  maxDiffChars: number;
  maxContextFiles: number;
  runGlobalSynthesis: boolean;
}

const AI_EXECUTION_POLICIES = {
  fast: {
    maxToolRounds: 4,
    maxDiffChars: 4_000,
    maxContextFiles: 4,
    runGlobalSynthesis: false,
  },
  complete: {
    maxToolRounds: 10,
    maxDiffChars: 12_000,
    maxContextFiles: 12,
    runGlobalSynthesis: true,
  },
} satisfies Record<AiExecutionMode, AiExecutionPolicy>;
```

Os números acima são exemplos para orientar testes. Eles não devem ser considerados definitivos antes de medição com projetos reais.

Além do número de rodadas, a implementação deve considerar budget de contexto acumulado para impedir crescimento descontrolado da conversa.

## Proteção contra loops

Ao aumentar o budget do modo Completo, o orquestrador deve impedir ciclos improdutivos.

Critérios desejados:

- detectar chamadas repetidas com os mesmos argumentos;
- evitar leituras repetidas do mesmo conteúdo sem progresso;
- contabilizar budget de contexto/resultado de ferramentas;
- encerrar com erro explicativo quando o modelo não progride;
- permitir cancelamento durante toda a execução.

## Code review em duas etapas

A Code review atual por arquivo será preservada e receberá uma segunda etapa opcional de síntese global.

```text
PR / branch diff
   │
   ├── review arquivo A ─┐
   ├── review arquivo B  ├── paralelo
   └── review arquivo C ─┘
              │
              ▼
       findings locais
              │
              ▼
       síntese global
              │
              ├── deduplicar findings
              ├── cruzar contratos entre arquivos
              ├── procurar regressões sistêmicas
              ├── verificar testes/compatibilidade
              └── gerar resumo final
```

### Modo Rápido

- executa somente a revisão por arquivo;
- não executa síntese global;
- usa limites menores definidos na policy.

### Modo Completo

- executa revisão por arquivo;
- executa síntese global ao final;
- usa budget de diff/contexto maior;
- procura problemas entre arquivos.

A resposta da síntese global deve ser validada com a mesma rigidez da revisão local. Resposta estruturada inválida não pode resultar em sucesso silencioso.

## Chunking e limites de diff

O limite fixo de diff deve evoluir para uma policy por modo e pelas capacidades do provider.

Quando o diff ultrapassar o budget permitido, o chunking deve preservar o contexto necessário para revisão:

- caminho do arquivo;
- cabeçalho dos hunks;
- linhas relevantes;
- identificação do trecho/chunk;
- contexto suficiente para unir os findings posteriormente.

Chunking semântico mais sofisticado pode ser adicionado depois; a primeira versão deve priorizar previsibilidade e rastreabilidade.

## Segurança e providers cloud

Providers cloud mudam o invariante atual de uma aplicação estritamente local e exigem uma entrega de segurança explícita.

### Masking obrigatório

Antes de habilitar qualquer provider externo:

- conteúdo de arquivo enviado ao provider deve passar por mascaramento de segredos;
- diffs devem passar por mascaramento;
- resultados de ferramentas que possam conter segredo devem passar por mascaramento antes de sair da máquina;
- testes devem provar que os caminhos de chat, implementation e review não contornam essa proteção.

A proteção deve ficar em um ponto compartilhado do caminho de saída para reduzir a chance de um provider futuro esquecer a etapa.

### Consentimento

O usuário deve ser avisado antes do primeiro envio de código a um provider cloud.

Direção inicial:

- consentimento por projeto;
- persistido em configuração local;
- indicar claramente que conteúdo pode sair da máquina;
- ao trocar de provider, permitir reconfirmar/revisar essa decisão;
- execução local nunca deve migrar para cloud silenciosamente.

### Credenciais e privacidade

- credenciais nunca entram no repositório;
- logs não devem persistir prompts/diffs sensíveis por padrão;
- características de retenção/uso de dados variam por provider e devem ser apresentadas conforme a documentação oficial vigente;
- não assumir que todos os providers possuem a mesma opção de retenção ou opt-out por requisição.

A introdução do primeiro provider cloud deve atualizar `docs/architecture/security.md` e qualquer documentação que atualmente declare ausência de chamadas externas.

## Providers planejados

A arquitetura deve permitir providers adicionais sem prometer integrações antes de validar o caminho oficial de autenticação e uso.

Direção de produto:

- **Ollama Local**: provider inicial e padrão local;
- **ChatGPT/Codex**: provider futuro, caso exista caminho oficial e sustentável de integração para o produto;
- **Gemini**: provider cloud alternativo;
- **Anthropic/Claude**: provider opcional quando houver credencial/caminho de integração compatível.

Planos, preços, quotas, autenticação e políticas mudam com frequência. Cada implementação deverá revalidar documentação oficial no momento do desenvolvimento.

## Seleção de provider

A experiência alvo é simples:

```text
Executar com
[ Local ▾ ]

Modo
[ Rápido ] [ Completo ]

                       [ Executar ]
```

Detalhes de modelo e opções específicas podem ficar em uma área avançada.

Provider e modo são independentes: por exemplo, Local + Completo ou um provider cloud + Rápido.

A UI de seleção não entra na primeira extração do `AiProvider`. Ela só deve ser adicionada quando existir um segundo provider utilizável.

## Fallback

Políticas previstas:

- `off`: encerra no provider escolhido;
- `offer`: falha e oferece continuar em outro provider;
- `automatic`: troca dentro de uma política aceita previamente.

A primeira implementação multi-provider deve usar **`offer`**.

Não implementar fallback automático na primeira versão. Em especial, Local → Cloud nunca acontece sem ação explícita do usuário.

## Decisões consolidadas após revisão

### Aprovado

- [x] Extrair um contrato `AiProvider`.
- [x] O Ollama será o primeiro `AiProvider`.
- [x] O loop de ferramentas do Assistente vira responsabilidade do `AiOrchestrator`.
- [x] `GitAiCodeReviewService` permanece separado do `AiOrchestrator`.
- [x] O catálogo fechado existente continua sendo o protocolo interno de ferramentas.
- [x] Compatibilidades específicas do Ollama ficam no `OllamaProvider`.
- [x] `fast`/`complete` serão policies explícitas e testáveis.
- [x] `fast` pula síntese global; `complete` executa síntese global.
- [x] A síntese global também exige saída estruturada válida.
- [x] Masking é pré-requisito para qualquer provider cloud.
- [x] Fallback inicial será `offer`.
- [x] Local → Cloud nunca será silencioso.
- [x] Testes de caracterização precedem a extração do provider.

### Adiado até existir necessidade concreta

- [ ] `ProviderRegistry` dinâmico.
- [ ] `ContextBuilder` como serviço independente.
- [ ] `ToolExecutor` como serviço independente.
- [ ] cache de árvore de símbolos/contexto.
- [ ] fallback automático.
- [ ] múltiplos providers na UI antes do segundo provider real.

## Critérios de sucesso da arquitetura

A evolução estará no caminho correto quando:

- um provider novo puder ser adicionado sem modificar Git, LSP, workspace edit e approval;
- o comportamento atual do Ollama permanecer coberto por testes de caracterização;
- opções específicas de provider não vazarem para todos os contratos;
- tool calling específico for normalizado dentro do adaptador correspondente;
- `fast` e `complete` tiverem policies determinísticas e cobertas por testes;
- o modo Completo conseguir analisar relações entre arquivos;
- falhas de saída estruturada/tool calling aparecerem como falha explícita;
- nenhuma alteração for aplicada sem preview e aprovação;
- nenhum conteúdo sensível for enviado a provider externo sem masking;
- a UI nunca trocar Local por Cloud silenciosamente.

## Ordem de implementação

A implementação está detalhada em [`../../tasks/AI-MULTI-PROVIDER.md`](../../tasks/AI-MULTI-PROVIDER.md).

Resumo da sequência:

1. documentação e roadmap;
2. caracterização e segurança;
3. `AiProvider` + `OllamaProvider` + `AiOrchestrator` mínimo;
4. modos `fast`/`complete`;
5. síntese global da Code review;
6. primeiro provider cloud;
7. seleção de provider na UI;
8. fallback `offer`.

Cada PR deve ser pequeno, manter o comportamento fora do próprio escopo, deixar CI verde e atualizar `PENDENCIAS.md`/`NEXT.md` quando a prioridade mudar.
