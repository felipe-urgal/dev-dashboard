# Project Profile e providers

`ProjectProfile` adiciona uma camada de discovery estruturada e extensível sem remover `Project.capabilities`. A migração é incremental: superfícies existentes podem continuar consumindo as capabilities legadas enquanto funcionalidades novas usam evidência normalizada.

## Contrato

Cada capability detectada possui:

- `id` estável, por exemplo `runtime/node`, `framework/vite` ou `container/compose`;
- `provider` responsável pela inferência;
- `confidence`: `certain`, `strong` ou `weak`;
- `evidence`: arquivo, manifest ou config que justifica a inferência;
- `metadata` serializável opcional, sem conteúdo secreto.

`Project.profile` é opcional por compatibilidade e contém `capabilities` + `diagnostics`.

## Providers do MVP

O registry padrão em `packages/project-discovery/src/project-profile.ts` contém providers independentes de:

1. `runtime` — `.nvmrc`, `.node-version`, `package.json#engines.node`, `.ruby-version` e Rails como evidência forte de Ruby;
2. `package-manager` — `packageManager` do `package.json` e lockfiles conhecidos;
3. `framework` — Rails e dependências declaradas de Next, Vite, Fastify e Turbo;
4. `container` — Dockerfile, Compose e Dev Container.

Nenhum provider executa scripts ou comandos do projeto. O MVP é inteiramente estático e local.

## Como adicionar um provider

Implemente `ProjectProfileProvider`:

```ts
const provider: ProjectProfileProvider = {
  id: 'ci',
  async detect(context) {
    // Leia somente evidências estáticas dentro de context.projectPath.
    return [];
  },
};
```

Depois registre o provider em `DEFAULT_PROJECT_PROFILE_PROVIDERS`. O agregador não precisa de `switch` por tipo de provider.

Regras para um provider novo:

- somente leitura;
- saída serializável e pequena;
- evidência explícita para toda capability;
- nunca retornar conteúdo de `.env`, credentials ou secrets;
- não executar scripts encontrados no projeto;
- não fazer rede no discovery base;
- preferir `unknown`/ausência de capability a uma inferência forte sem evidência;
- incluir testes de fixture para evidência positiva e ausência/ambiguidade relevante.

## Falha parcial

Os providers são executados de forma independente com `Promise.allSettled`. Se um falhar, as capabilities dos demais continuam no profile e a falha entra em `diagnostics` com o `provider` responsável. Isso impede que um parser opcional torne o projeto inteiro indisponível.

## Integração com discovery existente

`detectProject` e `scanWorkspace` continuam executando o detector atual e o enriquecimento de Production Contract. Em seguida acrescentam o profile. As capabilities legadas não são derivadas nem removidas neste primeiro passo; os testes existentes continuam sendo o contrato de compatibilidade.

A varredura recursiva mantém o timeout global. Se o enriquecimento exceder o orçamento restante, o resultado parcial continua seguindo o comportamento já existente de `SCAN_TIMEOUT`.

## Segurança

O profile descreve **estrutura**, não estado secreto. Metadata pode carregar versões declaradas, nomes de ferramentas e outras informações não sensíveis, mas não valores de ambiente, tokens ou conteúdo arbitrário de configuração.
