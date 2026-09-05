# Project Profile

O `Project Profile` complementa `Project.capabilities` com evidência estruturada e explicável sobre o projeto detectado. As capabilities legadas continuam sendo o contrato de compatibilidade usado pelas telas atuais; o profile existe para novas features que precisam saber **por que** determinada capacidade foi detectada sem espalhar condicionais por tipo de projeto.

## Providers

Os providers ficam em `packages/project-discovery/src/project-profile.ts` e implementam `ProjectProfileProvider`. O registry padrão é explícito e atualmente cobre:

- runtime (`node`/`ruby`);
- package manager;
- frameworks;
- container/Compose/devcontainer;
- CI (`.github/workflows` e `.gitlab-ci.yml`);
- arquivos de contrato de environment reconhecidos (`.env*.example`/`.env.sample`).

Cada provider retorna `DetectedCapability[]` com `provider`, `confidence` e `evidence`. O discovery executa os providers com `Promise.allSettled`: falha de um provider gera diagnóstico sanitizado e não invalida os demais resultados.

## Fronteira de segurança

Providers de profile são **read-only**. Eles podem consultar apenas evidência estática conhecida dentro do root do projeto e não devem:

- executar scripts ou comandos do projeto;
- abrir conexões de rede;
- interpretar shell arbitrário;
- retornar valores de `.env` ou outros secrets;
- propagar mensagens de erro internas que possam conter dados sensíveis.

O provider de environment registra somente nomes dos arquivos reconhecidos como evidência. O conteúdo desses arquivos não faz parte do `ProjectProfile`.

## Como adicionar um provider

1. implementar `ProjectProfileProvider` com um `id` estável;
2. produzir IDs de capability estáveis e evidência mínima suficiente para explicar a detecção;
3. adicionar o provider ao `DEFAULT_PROJECT_PROFILE_PROVIDERS` somente quando ele for útil ao comportamento real do produto;
4. cobrir presença, ausência e falha parcial em `packages/project-discovery/test/project-profile.test.ts`;
5. preservar as regras de segurança acima.

Evite abstrações adicionais para um único provider. Extraia helpers somente quando houver repetição real ou uma fronteira independente de segurança/lifecycle.
