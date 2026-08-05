# Task 094 — Perfis de ambiente reutilizáveis

## Objetivo

Permitir que a pessoa usuária cadastre conjuntos nomeados de variáveis de ambiente
("perfis") reutilizáveis no dashboard web, sem jamais persistir o valor de variáveis
que pareçam segredos — atendendo o item do inventário (`docs/PENDENCIAS.md`)
"Adicionar perfis de ambiente reutilizáveis sem armazenar segredos no frontend".

## Decisões

- perfis são geridos na tela de Configurações (`/settings`), não por projeto: são
  reutilizáveis entre projetos, já que a execução de scripts (`ScriptExecutionService`)
  só aceita variáveis previamente declaradas por cada script — este entrega não altera
  esse contrato, apenas oferece um local para guardar nomes/valores não sensíveis com
  antecedência;
- toda variável cujo nome contenha termos como `SECRET`, `TOKEN`, `PASSWORD`,
  `CREDENTIAL`, `PRIVATE`, `_KEY`/`KEY` ou `APIKEY` nunca tem seu valor persistido —
  apenas o nome é guardado, tanto no cliente (campo desabilitado) quanto no servidor
  (o valor é descartado mesmo que enviado);
- nomes de variável seguem um padrão de identificador (`/^[A-Za-z_][A-Za-z0-9_]*$/`),
  limitado a 128 caracteres; valores a 4096 caracteres; até 30 variáveis por perfil e
  50 perfis no total;
- nomes de perfil são únicos e limitados a 100 caracteres.

## Segurança e limites

- `EnvironmentProfileRepository` (`packages/core`) grava em
  `~/.config/dev-dashboard/environment-profiles.json`, diretório `0700` e arquivo
  `0600`, escrita atômica por arquivo temporário e `rename` (mesmo padrão de
  `ProjectFavoriteRepository`);
- rotas em `/api/settings/environment-profiles` exigem o token local (`X-Dev-Dashboard-Token`)
  como as demais rotas privadas; schemas de corpo e resposta fechados
  (`additionalProperties: false`);
- nenhuma execução de comando depende deste cadastro nesta entrega — os perfis apenas
  armazenam pares nome/valor, sem `spawn`, sem leitura de arquivo do projeto.

## Implementação

- contratos em `packages/contracts/src/environment-profile.ts`
  (`EnvironmentProfile`, `EnvironmentProfileVariable`, `EnvironmentProfileLimits`,
  `EnvironmentProfileList`, `CreateEnvironmentProfileInput`);
- `EnvironmentProfileRepository` em `packages/core` (CRUD, fila de mutação
  sequencial, validação de nome/variáveis);
- rotas `GET/POST /api/settings/environment-profiles` e
  `PUT/DELETE /api/settings/environment-profiles/:profileId` em
  `apps/api/src/routes/settings.ts`, registradas em `apps/api/src/app.ts` via
  `AppContext`;
- seção "Perfis de ambiente" na tela de Configurações (`apps/web/src/views/SettingsView.vue`):
  lista de perfis existentes, formulário de criação/edição com linhas dinâmicas de
  variável, campo de valor desabilitado automaticamente quando o nome parece sensível;
- funções de API no frontend em `apps/web/src/api/settings.ts`.

## Testes

- `packages/core/test/environment-profile-repository.test.ts`: persistência,
  permissões de arquivo, mascaramento de valor sensível, nome duplicado, nome de
  variável inválido, atualização e remoção;
- `apps/api/test/settings-routes.test.ts`: autenticação obrigatória, criação sem
  persistir valor sensível, listagem, atualização, conflito de nome duplicado,
  remoção e "não encontrado" após remover;
- `apps/web/test/settings-view.test.ts`: criação de perfil pela UI confirma que o
  campo de valor fica desabilitado e que a variável sensível é enviada sem valor.

## Limitações conhecidas

- os perfis não se aplicam automaticamente às variáveis declaradas de um script —
  isso exige decidir como casar nomes de variável do perfil com a lista declarada
  por cada `ProjectScript`, e fica para uma próxima entrega;
- não há importação/exportação de perfis nem compartilhamento entre instalações.

## Resultado

Implementado como uma das três frentes paralelas iniciadas a partir do inventário de
`docs/tasks/PARALLEL-WORK.md`.
