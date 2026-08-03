# Task 077 — Editor seguro no projeto

## Status

Segunda fatia em revisão. O editor já salva arquivos existentes com controle de
versão e agora adiciona criação, renomeação e exclusão seguras pelo explorer.

## Objetivo

Permitir trabalhar nos arquivos autorizados do projeto pelo Monaco sem expor o
filesystem inteiro, aceitar comandos do navegador ou sobrescrever mudanças
externas silenciosamente.

## Escopo entregue

### Edição e salvamento

- `ProjectFileContent.writable` reflete a permissão real do arquivo;
- contrato `ProjectFileWriteRequest` com caminho relativo, conteúdo e
  `expectedVersion`;
- endpoint autenticado `PUT /api/projects/:projectId/files/content`;
- validação SHA-256 antes da gravação e imediatamente antes do `rename`;
- resposta `409 FILE_CHANGED_EXTERNALLY` quando o arquivo mudou no disco;
- arquivo temporário exclusivo no mesmo diretório, `fsync`, preservação do modo
  e substituição atômica;
- estado sujo independente por aba, botão Salvar e `Ctrl/Cmd+S`;
- decisão inline ao fechar uma aba alterada;
- conflito externo preserva o disco e o modelo editado.

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
- explorer atualiza apenas os diretórios envolvidos, sem recarregar a página;
- abas limpas afetadas por renomeação ou exclusão são fechadas e um arquivo
  renomeado que estava aberto é reaberto no novo caminho;
- ações estruturais ficam bloqueadas quando existe edição não salva no caminho.

## Segurança

- somente caminhos relativos e normalizados são aceitos;
- raiz do projeto, traversal, barras invertidas e segmentos vazios são recusados;
- diretório pai e destino são resolvidos pela raiz canônica;
- symlinks no caminho ou no impacto bloqueiam a operação;
- `.git`, `node_modules`, builds, cobertura e arquivos sensíveis continuam fora
  da fronteira do editor;
- uma pasta que contém item protegido não pode ser renomeada ou excluída;
- criação usa `wx` para impedir sobrescrita implícita;
- preview recursivo é limitado a 2.000 itens e 100 MB;
- conteúdo inicial de arquivo continua limitado a 512 KiB;
- nenhuma operação aceita comando, glob ou caminho absoluto do navegador.

## Endpoints

```http
POST /api/projects/:projectId/files/entries
POST /api/projects/:projectId/files/mutations/preview
POST /api/projects/:projectId/files/mutations/apply
```

Criação é não destrutiva e aplicada diretamente. Renomeação e exclusão passam
por preview e confirmação de uso único.

## Arquivos principais

- `packages/contracts/src/project-files.ts`;
- `apps/api/src/services/project-file-service.ts`;
- `apps/api/src/services/project-file-mutation-service.ts`;
- `apps/api/src/routes/project-files.ts`;
- `apps/api/src/routes/project-file-mutations.ts`;
- `apps/web/src/api/project-files.ts`;
- `apps/web/src/api/project-file-mutations.ts`;
- `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/web/src/components/ProjectFileMutationPanel.vue`;
- testes de serviço, rotas e componentes do editor.

## Critérios de aceite

- salvar renova a versão e preserva o modo do arquivo;
- alteração externa nunca é substituída silenciosamente;
- criação não sobrescreve e não escapa por symlink;
- renomeação mostra origem, destino e impacto antes de aplicar;
- exclusão mostra caminho e impacto, com confirmação reforçada para conteúdo;
- token expirado, reutilizado ou divergente não altera o disco;
- colisão de destino não remove nem substitui o item existente;
- explorer e abas permanecem coerentes depois da operação;
- build, typecheck, testes de API, testes web e smoke E2E passam.

## Limitações atuais

- conflito externo ainda não possui diff em três vias;
- não há watcher contínuo; o conflito é detectado no salvamento ou aplicação;
- operações múltiplas ainda não usam `WorkspaceEdit` com rollback;
- criação de arquivo começa vazia, sem templates;
- LSP, IA e terminal continuam fora do escopo.

## Próxima atividade

Concluir a task 077 com watcher limitado aos arquivos abertos, comparação em
três vias e `WorkspaceEdit` para preview e aplicação atômica de mudanças em
múltiplos arquivos. Depois disso, iniciar a task 078 de LSP JavaScript/TypeScript.
