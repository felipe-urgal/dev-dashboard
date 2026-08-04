# Task 087 — Exportação segura de logs

## Status

Implementada e aguardando revisão.

## Contexto

Servidor, testes e scripts já devolviam ao navegador snapshots limitados e
mascarados. A leitura permanecia restrita aos processos gerenciados, com teto
de 262144 bytes e metadados explícitos de truncamento e substituições. Ainda
faltava uma forma de salvar o mesmo trecho seguro exibido na interface sem
criar uma rota para o arquivo bruto.

## Objetivo

Permitir baixar o snapshot de log atualmente carregado nos três domínios,
preservando exatamente o conteúdo autorizado pela API e sem ampliar acesso ao
filesystem, ao histórico ou ao processo produtor.

## Implementação

### Utilidade compartilhada

`apps/web/src/utils/log-export.ts` concentra todo o fluxo:

- recusa conteúdo vazio;
- normaliza projeto, origem, identificação e horário para um nome de arquivo
  seguro, removendo separadores de caminho, acentos e caracteres inadequados;
- remove quebras de linha dos metadados textuais para impedir que um nome
  altere a estrutura do cabeçalho;
- monta um arquivo UTF-8 com projeto, origem, identificação pública, captura,
  truncamento, mascaramento e quantidade de substituições;
- cria um `Blob`, dispara o download por um elemento `<a>` temporário e revoga
  o `ObjectURL` no bloco `finally`;
- nunca transforma o corpo do snapshot nem tenta completar um trecho
  truncado.

### Servidor

`ProjectLogsPanel` usa diretamente o `ProcessLogSnapshot` já mantido pelo
polling. O botão **Exportar** fica na barra de ferramentas e só é habilitado
quando o snapshot atual possui conteúdo.

A exportação usa `processId` e `readAt` já presentes no contrato público. Não é
feita nova chamada HTTP ao clicar.

### Testes

`useProjectTestProcess` passou a manter o `ProcessLogSnapshot` completo, em vez
de reduzir a resposta a conteúdo e flag de truncamento. O mesmo objeto é
atualizado por leitura HTTP, evento SSE, limpeza e troca de projeto.

`ProjectTestsGuidedPanel` oferece **Exportar log** ao lado de copiar e limpar,
usando o snapshot atual e os metadados de `processId`/`readAt`.

### Scripts

`useScriptExecution` passou a manter o `ScriptExecutionLog` completo para a
execução ativa ou selecionada no histórico. Recuperação HTTP, SSE e leitura
final atualizam uma única referência.

`ProjectScriptsPanel` oferece **Exportar log** no cabeçalho da saída da
execução, usando `executionId` como identificação pública.

## Segurança

- nenhuma rota HTTP foi criada ou alterada;
- o navegador não envia caminho de log, diretório ou nome de arquivo ao
  servidor;
- o conteúdo exportado é somente o snapshot já mascarado e limitado que está
  em memória no frontend;
- o arquivo bruto local não é relido e não existe fallback quando o snapshot
  está vazio;
- nomes de arquivo não preservam `/`, `\\`, segmentos `..` isolados ou
  caracteres de controle;
- metadados não podem injetar linhas adicionais no cabeçalho;
- o `ObjectURL` é revogado após o clique e o elemento temporário é removido;
- valores que já foram substituídos por `[CONTEUDO_MASCARADO]` permanecem assim
  no arquivo.

## Testes automatizados

`apps/web/test/log-export.test.ts` cobre:

- sanitização de projeto, identificação e separadores de caminho;
- fallback para segmentos inválidos;
- cabeçalho normal, truncado e mascarado;
- preservação do marcador de conteúdo protegido;
- recusa de conteúdo vazio;
- criação do `Blob`, clique, remoção do link e revogação do `ObjectURL`.

`apps/web/test/log-export-panels.test.ts` monta os três painéis e comprova:

- servidor exporta o snapshot mascarado atual;
- testes exportam o snapshot atual sem nova leitura HTTP;
- scripts exportam o log da execução selecionada sem nova leitura HTTP;
- identificadores e horários públicos são encaminhados corretamente;
- nenhum valor original ausente do mock reaparece.

## Critérios de aceite

- exportação disponível para servidor, testes e scripts — atendido;
- estado vazio não gera arquivo — atendido;
- conteúdo, truncamento e mascaramento do snapshot são preservados — atendido;
- nenhum caminho absoluto ou arquivo bruto é solicitado — atendido;
- nome do arquivo é seguro — atendido;
- `ObjectURL` é revogado — atendido;
- fluxo compartilhado e testável — atendido;
- nenhuma mudança de API ou contrato — atendido.

## Arquivos principais

- `apps/web/src/utils/log-export.ts`;
- `apps/web/src/components/ProjectLogsPanel.vue`;
- `apps/web/src/components/ProjectLogsPanel.template.html`;
- `apps/web/src/composables/useProjectTestProcess.ts`;
- `apps/web/src/composables/useProjectTestsPanel.ts`;
- `apps/web/src/components/ProjectTestsGuidedPanel.vue`;
- `apps/web/src/components/ProjectTestsGuidedPanel.template.html`;
- `apps/web/src/composables/useScriptExecution.ts`;
- `apps/web/src/components/ProjectScriptsPanel.vue`;
- `apps/web/test/log-export.test.ts`;
- `apps/web/test/log-export-panels.test.ts`.

## Validação

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
```

A validação completa será registrada pelo CI do pull request.

## Fora do escopo

- download do arquivo bruto ou completo;
- nova rota de exportação;
- ZIP, JSON ou múltiplos logs num pacote;
- escolha de diretório pelo backend;
- exportação de todo o histórico;
- upload ou compartilhamento remoto;
- aumento do limite de leitura;
- novos padrões de mascaramento.
