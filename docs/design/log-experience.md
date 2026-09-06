# Experiência compartilhada de logs

## Estado atual

A experiência de log do Dev Dashboard prioriza **saída real, legível e limitada**, usando componentes Vue/terminal declarativos. A antiga proposta de transformar todas as saídas em uma camada comum de “Fluxo + Diagnóstico” não é mais a arquitetura geral do produto.

Não use este documento para justificar enhancer global de DOM, `MutationObserver` ou parsing genérico obrigatório sobre toda saída.

## Princípios

1. **Log pertence ao domínio que produz a execução.** Servidor, Sidekiq/Webpack, Testes, Dependências, banco e Deployment mantêm seus lifecycles/contratos próprios.
2. **Saída bruta continua sendo evidência.** Não esconda o log real atrás de uma classificação que pode errar.
3. **Diagnóstico tipado só quando existe regra confiável.** Ex.: `P1001` em `prod:check` pode virar um erro estável; texto livre arbitrário não vira protocolo.
4. **Mascaramento acontece antes da exposição.** UI não é a fronteira principal para esconder secrets.
5. **Limites são obrigatórios.** Buffers, arquivos, streams e respostas precisam de teto conhecido.
6. **Auto-follow respeita leitura humana.** Se a pessoa rola para cima, não force o viewport de volta ao final até ela pedir.
7. **Estado visual é real.** Terminal parado não finge streaming; loading só existe com trabalho em andamento.

## Servidor

Logs do servidor ficam dentro da aba **Servidor**. A antiga aba separada Logs foi removida; sua rota histórica redireciona para Servidor.

O snapshot é entregue ao componente de terminal/log atual. A UI oferece leitura cronológica e acompanhamento do final sem pós-processamento global do DOM.

A identidade/status do processo não é inferida pelo conteúdo do log. Processo, PID/ownership, porta e lifecycle vêm do Process Manager.

## Sidekiq e Webpack

Runtimes Rails reconhecidos combinam status/lifecycle e terminal de saída na própria superfície. Eles não precisam passar por uma engine universal de diagnóstico para serem úteis.

## Testes e Dependências

Execuções longas podem usar PTY destacável e continuar no backend após a navegação da página. O buffer é bounded e o frontend pode reanexar enquanto o registro ainda existir.

Não classifique uma suíte como flaky apenas por texto de log; Test Intelligence possui contratos próprios para evidência histórica.

## Banco e migrations

Operações Rails/migrations também podem usar execução destacável. Erros específicos só devem ganhar diagnóstico tipado quando existe código/condição estável reconhecida.

O Database Explorer trabalha com resultados estruturados do driver; não converta tabela/consulta em “log” apenas para reutilizar UI.

## Deployment

Deployment mantém timeline + log operacional próprios.

- stdout/stderr local passa por masking/limites;
- mensagens de provider são normalizadas;
- corpo bruto externo não é persistido como log por padrão;
- timeline é estado de domínio, não parsing visual da saída.

## Docker Compose e Local CI

Existem fundações read-only para Docker Compose e `act`, mas seus lifecycles completos de produto ainda estão abertos nas issues #588/#594.

Quando logs forem adicionados, eles devem reutilizar a infraestrutura de execução/stream adequada sem criar uma segunda identidade/lifecycle.

## Transporte

Não existe regra única de que todo log precisa de polling ou SSE.

Use a fonte apropriada:

- snapshot para leitura pontual;
- SSE/WS quando o backend já oferece evento adequado;
- polling somente como fallback explícito e com cleanup;
- PTY para execuções que realmente precisam de semântica de terminal.

A política geral de estado vivo está em [`../architecture/frontend-live-state.md`](../architecture/frontend-live-state.md).

## Segurança

O browser não escolhe path absoluto de log. A API deriva a fonte a partir de projeto/execução conhecidos e aplica limites/masking antes de devolver conteúdo.

Secrets reconhecidos podem ser mascarados, mas isso não autoriza o projeto alvo a imprimir credenciais deliberadamente.

Não inclua em logs públicos:

- tokens;
- cookies/sessões;
- URLs de banco com credencial;
- conteúdo de `.env`;
- bodies brutos de providers;
- paths internos desnecessários.

## Implementação visual

Prefira componentes Vue/composables declarativos. A antiga camada de enhancers vanilla-DOM foi removida/refatorada; novas features não devem reintroduzi-la.

Quando uma superfície precisar de diagnóstico rico, implemente-o como parser/componente do domínio, com testes próprios e acesso ao log original como evidência.

## Guia de uso

- [Servidor](../guia/servidor.md)
- [Logs integrados](../guia/logs.md)
- [Testes](../guia/testes.md)
- [Dependências](../guia/dependencias.md)
- [Produção](../production-ui.md)
