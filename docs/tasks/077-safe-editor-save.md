# Task 077 — Editor seguro no projeto

## Status

Concluída para edição de arquivos de texto. O editor possui salvamento
versionado, operações estruturais seguras, watcher limitado aos arquivos
abertos, comparação em três vias e `WorkspaceEdit` v1 para alterações textuais
em múltiplos arquivos.

## Objetivo

Permitir trabalhar nos arquivos autorizados do projeto pelo Monaco sem expor o
filesystem inteiro, aceitar comandos do navegador ou sobrescrever mudanças
externas silenciosamente.

## Escopo entregue

### Edição e salvamento

- `ProjectFileContent.writable` reflete a permissão real do arquivo;
- contrato `ProjectFileWriteRequest` com caminho relativo, conteúdo e
  `expectedVersion` SHA-256;
- endpoint autenticado `PUT /api/projects/:projectId/files/content`;
- validação da versão antes da gravação e imediatamente antes do `rename`;
- resposta `409 FILE_CHANGED_EXTERNALLY` quando o arquivo mudou no disco;
- arquivo temporário exclusivo no mesmo diretório, `fsync`, preservação do modo
  e substituição atômica;
- estado sujo independente por aba, botão Salvar e `Ctrl/Cmd+S`;
- decisão inline ao fechar uma aba alterada;
- conflito externo nunca substitui o disco nem o modelo local automaticamente.

### Operações estruturais

- criação exclusiva de arquivo vazio ou diretório por caminho relativo;
- preview obrigatório antes de renomear ou excluir;
- token de confirmação de uso único, vinculado ao projeto, operação, caminho,
  destino e fingerprint do impacto;
- token expira após cinco minutos;
- renomeação nunca substitui um destino existente;
- exclusão de arquivo ou diretório vazio exige confirmação simples;
- exclusão de diretório com conteúdo exige digitar o caminho completo;
- preview informa quantidade de arquivos, diretórios e bytes afetados;
- alteração externa entre preview e aplicação invalida a operação;
- explorer e abas são atualizados incrementalmente;
- ações estruturais ficam bloqueadas quando existe edição não salva no caminho.

### Watcher dos arquivos abertos

- monitora somente os arquivos já autorizados e abertos no Monaco;
- limita a consulta a 20 arquivos por vez;
- usa polling de 2,5 segundos somente enquanto o documento está visível;
- arquivo limpo alterado externamente é atualizado no modelo sem recarregar a
  página;
- arquivo sujo alterado externamente preserva a edição local e abre revisão;
- arquivo removido ou indisponível mantém a aba aberta e apresenta aviso;
- fechar uma aba remove seu caminho do conjunto monitorado.

### Comparação em três vias

- apresenta **Base aberta**, **Minha edição** e **Disco atual** lado a lado;
- permite recarregar a versão do disco;
- permite manter explicitamente a edição local e salvar sobre a nova versão;
- não realiza merge automático nem descarta conteúdo por decisão implícita;
- o Monaco deixa de consumir a roda nos limites do arquivo, permitindo que o
  scroll continue na página.

### WorkspaceEdit v1

- contrato fechado de alterações textuais por caminho, versão e faixa;
- preview consolidado antes da aplicação;
- até 20 arquivos e 200 edições por arquivo;
- rejeição de faixas inválidas, invertidas, sobrepostas ou ambíguas;
- limite de 512 KiB por arquivo e 4 MiB para o preview total;
- confirmação de uso único válida por cinco minutos;
- todas as versões são revalidadas antes da primeira escrita;
- aplicação em ordem determinística usando o salvamento atômico existente;
- rollback dos arquivos já escritos quando uma etapa posterior falha;
- falha de rollback é reportada explicitamente e nunca apresentada como sucesso.

O `WorkspaceEdit` v1 altera arquivos de texto existentes. Criação, renomeação e
exclusão continuam no fluxo estrutural seguro já entregue, e ainda não são
agrupadas dentro do mesmo `WorkspaceEdit`.

## Segurança

- somente caminhos relativos e normalizados são aceitos;
- raiz do projeto, traversal, barras invertidas e segmentos vazios são recusados;
- diretório pai, origem e destino são resolvidos pela raiz canônica;
- symlinks no caminho ou no impacto bloqueiam a operação;
- `.git`, `node_modules`, builds, cobertura e arquivos sensíveis continuam fora
  da fronteira do editor;
- uma pasta que contém item protegido não pode ser renomeada ou excluída;
- criação usa modo exclusivo para impedir sobrescrita implícita;
- preview recursivo estrutural é limitado a 2.000 itens e 100 MB;
- nenhuma operação aceita comando, glob ou caminho absoluto do navegador;
- nenhum evento externo aplica merge ou gravação automaticamente.

## Endpoints

```http
PUT  /api/projects/:projectId/files/content
POST /api/projects/:projectId/files/entries
POST /api/projects/:projectId/files/mutations/preview
POST /api/projects/:projectId/files/mutations/apply
POST /api/projects/:projectId/files/watch
POST /api/projects/:projectId/files/workspace-edits/preview
POST /api/projects/:projectId/files/workspace-edits/apply
```

## Arquivos principais

- `packages/contracts/src/project-files.ts`;
- `apps/api/src/services/project-file-service.ts`;
- `apps/api/src/services/project-file-mutation-service.ts`;
- `apps/api/src/services/project-workspace-edit-service.ts`;
- `apps/api/src/routes/project-files.ts`;
- `apps/api/src/routes/project-file-mutations.ts`;
- `apps/api/src/routes/project-workspace-edits.ts`;
- `apps/web/src/api/project-files.ts`;
- `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/web/src/components/ProjectEditorConflictReview.vue`;
- `apps/web/src/composables/useProjectOpenFileWatcher.ts`;
- testes de serviço, rotas, contratos e componentes do editor.

## Critérios de aceite

- salvar renova a versão e preserva o modo do arquivo;
- alteração externa nunca é substituída silenciosamente;
- modelos sujos sobrevivem a mudança, remoção e indisponibilidade externa;
- revisão mostra base, edição e disco antes de qualquer escolha destrutiva;
- criação não sobrescreve e não escapa por symlink;
- renomeação e exclusão exibem impacto e exigem confirmação válida;
- `WorkspaceEdit` obsoleto invalida o conjunto inteiro antes da primeira escrita;
- falha intermediária restaura as alterações já aplicadas quando reversíveis;
- token expirado, reutilizado ou divergente não altera o disco;
- explorer, abas e modelos permanecem coerentes;
- typecheck, build, testes de API, testes web e smoke E2E passam.

## Limitações atuais

- o watcher usa polling limitado aos arquivos abertos, não eventos nativos do SO;
- renomeação externa aparece como remoção/indisponibilidade, sem correlação
  automática com o novo caminho;
- a revisão em três vias não oferece merge automático nem cópia por trecho;
- `WorkspaceEdit` v1 não agrupa criação, renomeação ou exclusão;
- LSP, IA e terminal continuam fora desta task.

## Próxima atividade

Iniciar a task 078 com LSP JavaScript/TypeScript, reutilizando o watcher, os
modelos por URI e o `WorkspaceEdit` textual seguro desta entrega.
