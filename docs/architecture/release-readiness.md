# Release Readiness

Release Readiness é uma camada de decisão somente leitura que agrega evidências já produzidas pelo Dev Dashboard para responder se uma branch possui sinais suficientes para seguir no fluxo de entrega.

Ela **não autoriza merge, push ou deployment** e não substitui os preflights/revalidações executados no momento de uma mutação sensível.

## Estados

Cada check usa um estado explícito:

- `pass`: existe evidência recente e suficiente para a regra;
- `warning`: a entrega pode exigir atenção, mas a regra não é um bloqueio determinístico;
- `block`: existe uma condição verificável que impede considerar o item pronto;
- `unknown`: não existe evidência suficiente ou a evidência está stale/inconclusiva.

O estado agregado usa a ordem conservadora `block > unknown > warning > pass`. Não existe score numérico de produtividade ou confiança.

## Primeiro recorte implementado

O núcleo puro em `apps/api/src/services/release-readiness.ts` normaliza três fontes locais já existentes:

### Git

- working tree dirty: `block`;
- detached HEAD/branch desconhecida: `warning`;
- branch sem upstream: `unknown`, porque `ahead=0/behind=0` sem referência remota não prova sincronização;
- branch com commits locais ainda não publicados (`ahead > 0`): `block`;
- branch atrás da referência remota (`behind > 0`): `block`;
- branch divergente (`ahead > 0` e `behind > 0`): `block`;
- `pass` somente quando há upstream conhecido, working tree limpa e `ahead=0/behind=0`.

### Testes

Somente uma execução com `scope=full-suite` e identidade compatível com o contexto atual pode produzir `pass`.

A identidade comparável segue o contrato do Test Intelligence:

- mesma `gitRevision`;
- mesmo `gitDirtyFingerprint`;
- mesmo `environmentInstanceId` quando houver identidade explícita de ambiente.

O Readiness recebe a identidade atual já resolvida pelo consumidor; ele não a inventa a partir de path/branch. Se a identidade atual estiver ausente, se a execução não possuir revisão/fingerprint compatíveis ou se não existir full suite comparável, o check fica `unknown`.

Quando existem execuções de outros contextos, o núcleo procura a full suite mais recente que seja realmente comparável. Um run mais novo de outra revisão não invalida uma evidência compatível ainda fresca, mas também nunca é usado como substituto.

Uma execução `targeted`, mesmo verde, não equivale à suíte completa. Resultado comparável stale ou sem conclusão vira `unknown`; suíte completa comparável recente com falha vira `block`.

A janela de freshness é fornecida pelo consumidor da regra. O núcleo não inventa uma política global de idade.

### Project Doctor

- `healthy`: `pass`;
- `attention`: `warning`;
- `blocked`: `block`.

Cada check preserva evidência, timestamp e uma ação de navegação. O serviço não executa a ação.

## Limites deste recorte

Este primeiro slice estabelece contrato e regras testáveis sem UI/HTTP. Ainda não inclui migrations, Production Contract, CI remoto nem uma tela dedicada. Essas fontes entram incrementalmente sem alterar a semântica dos estados acima.

Falha ou ausência de uma fonte deve continuar produzindo `unknown` para aquela regra, e nunca um falso `pass`.
