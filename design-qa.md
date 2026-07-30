# Design QA — CRUD de branches

## Evidências

- Verdade visual:
  `/workspace/scratch/560252e246ed/generated_images/call_e2RJUt61EAP2C99iMN6hiJl0.png`
- Dimensão da referência: `1909 × 824 px`.
- Implementação: painel Git do projeto `mock-project`, aba Branches, modal
  "Nova branch" aberto.
- Screenshot da implementação: indisponível.
- Viewport pretendido: desktop, equivalente ao quadro `1909 × 824`, densidade
  `1`.
- Estado pretendido: lista com branches locais e de `origin`, filtro "Todas" e
  modal de criação aberto com prefixo `feature/`.

## Bloqueio

O build local e a API de fixture foram iniciados, mas o navegador em nuvem não
conseguiu alcançar `http://terminal.local:4173/`
(`net::ERR_CONNECTION_REFUSED`). O comando `sites-preview` também não pôde
registrar a prévia porque o mailbox do serviço não está disponível nesta
sessão. Sem uma captura renderizada pelo navegador, não é possível produzir a
comparação conjunta obrigatória.

## Superfícies de fidelidade

- Fontes e tipografia: não verificadas no navegador.
- Espaçamento e ritmo de layout: não verificados no navegador.
- Cores e tokens: o código usa os tokens existentes e os testes estáticos
  passam, mas a renderização não foi comparada.
- Imagens e assets: a tela não possui imagens raster; os ícones usam
  `@heroicons/vue`. A fidelidade visual não foi comparada.
- Copy e conteúdo: cobertos por testes de componente, sem conferência visual.

## Interações automatizadas cobertas

- entrada direta em Branches, sem a aba Resumo;
- filtros local/remoto e presença passiva de `origin`;
- abertura do modal, escolha de prefixo e criação;
- troca, renomeação e remoção de branch;
- confirmação digitada antes da remoção.

## Console

Não verificado: a página não abriu no navegador em nuvem.

## Achados

- [P0] Evidência renderizada indisponível.
  Local: prévia Work Mode.
  Evidência: `terminal.local:4173` recusou a conexão.
  Impacto: impede validar visualmente a implementação contra o protótipo.
  Correção: repetir a captura quando o serviço de prévia do Work Mode estiver
  disponível.

## Histórico de comparação

- Iteração 1: bloqueada antes da captura; nenhuma comparação visual foi
  possível e nenhuma correção visual foi inferida sem evidência.

## Checklist de retomada

1. Iniciar a prévia com `sites-preview`.
2. Abrir a aba Branches do projeto fixture.
3. Abrir "Nova branch".
4. Capturar no mesmo viewport da referência.
5. Montar referência e implementação na mesma imagem e revisar P0/P1/P2.

final result: blocked
