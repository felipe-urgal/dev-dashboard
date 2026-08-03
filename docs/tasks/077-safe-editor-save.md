# Task 077 — Salvamento seguro no editor

## Status

Implementação em revisão. Esta primeira fatia da task 077 habilita edição e
salvamento de arquivos existentes; operações estruturais ficam para a próxima
entrega.

## Objetivo

Permitir editar arquivos autorizados dentro do Monaco sem sobrescrever
silenciosamente mudanças feitas por outro editor ou processo.

## Escopo entregue

- `ProjectFileContent.writable` passa a refletir a permissão real do arquivo;
- contrato `ProjectFileWriteRequest` com caminho relativo, conteúdo e
  `expectedVersion`;
- endpoint autenticado `PUT /api/projects/:projectId/files/content`;
- validação do hash SHA-256 esperado antes da gravação e imediatamente antes do
  `rename`;
- resposta `409 FILE_CHANGED_EXTERNALLY` quando o arquivo mudou no disco;
- escrita em arquivo temporário exclusivo no mesmo diretório;
- `fsync`, preservação do modo existente e `rename` atômico;
- limpeza do temporário em falhas intermediárias;
- Monaco editável somente quando a API indica `writable: true`;
- estado sujo independente por aba;
- salvamento pelo botão ou por `Ctrl/Cmd+S`;
- bloqueio de fechamento acidental com decisão inline para descartar;
- aviso antes de descarregar a página quando existem alterações abertas;
- conflito externo preserva tanto o conteúdo do disco quanto o modelo editado;
- ação explícita para recarregar a versão atual do disco;
- fallback textual continua somente leitura quando o Monaco falha.

## Segurança

A mutação reaproveita a fronteira da task 076 e adiciona:

- somente arquivos existentes e previamente autorizados podem ser gravados;
- caminhos absolutos, traversal, arquivos sensíveis e symlinks externos
  continuam recusados;
- conteúdo acima de 512 KiB é recusado por bytes, além da validação HTTP;
- arquivos binários não entram no fluxo de escrita;
- a versão enviada deve ser um SHA-256 válido;
- o arquivo temporário usa nome aleatório, criação exclusiva e o mesmo
  diretório canônico do destino;
- o destino é revalidado antes do `rename`;
- falta de permissão mantém o editor utilizável em modo somente leitura;
- nenhuma operação aceita comando, glob ou caminho absoluto do navegador.

## Endpoint

```http
PUT /api/projects/:projectId/files/content
Content-Type: application/json

{
  "path": "src/main.ts",
  "content": "...",
  "expectedVersion": "<sha256>"
}
```

A resposta é um novo `ProjectFileContent`, com versão, tamanho e data de
modificação atualizados.

## Arquivos principais

- `packages/contracts/src/project-files.ts`;
- `apps/api/src/services/project-file-service.ts`;
- `apps/api/src/routes/project-files.ts`;
- `apps/web/src/api/project-files.ts`;
- `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/api/test/project-file-service.test.ts`;
- `apps/api/test/project-file-routes.test.ts`;
- `apps/web/test/project-embedded-editor.test.ts`.

## Critérios de aceite

- salvar renova a versão e preserva o modo do arquivo;
- uma alteração externa nunca é substituída sem decisão explícita;
- falha de gravação não deixa arquivo parcial ou temporário;
- cada aba mantém seu próprio estado não salvo;
- fechar uma aba suja exige descarte explícito;
- `Ctrl/Cmd+S` salva somente a aba ativa;
- arquivos sem permissão continuam legíveis e não editáveis;
- build, typecheck, testes de API, testes web e smoke E2E passam.

## Limitações desta fatia

- não cria arquivos ou diretórios;
- não renomeia nem exclui;
- conflito externo ainda não possui diff em três vias;
- não há watcher contínuo; o conflito é detectado no salvamento;
- não existe `WorkspaceEdit` para múltiplos arquivos;
- LSP, IA e terminal continuam fora do escopo.

## Próxima atividade

Continuar a task 077 com criação, renomeação e exclusão seguras, preview de diff,
confirmações proporcionais ao risco e um serviço central de `WorkspaceEdit`.
