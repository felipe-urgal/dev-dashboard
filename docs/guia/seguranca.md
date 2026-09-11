# Segurança

A aba **Segurança** reúne uma inspeção local e manual de secrets e misconfigurations usando o provider de segurança disponível no backend. Ela segue o mesmo shell das demais ferramentas do projeto: header com projeto/branch/repositório, navegação por abas e conteúdo específico abaixo dessa navegação.

## O que a tela mostra

No topo do conteúdo, o Security Center apresenta o estado real do scanner e a evidência observada pelo backend. O provider atual é `trivy` e a disponibilidade pode ser:

- **Disponível**: o scanner pode ser executado manualmente.
- **Não instalado**: o executável não foi encontrado no ambiente da API.
- **Indisponível**: o provider existe como integração, mas não pode ser usado naquele momento.

A faixa compacta do scanner mostra provider, versão quando conhecida, estado do scan da sessão e a indicação **Somente sessão**.

## Execução manual e autoridade

O botão **Executar scan** só fica habilitado quando a API comprova que o provider está disponível.

O navegador não escolhe nem envia caminho local, executável ou argumentos do scanner. A web envia somente o `projectId` pela rota estruturada e um body JSON vazio; resolução de path, programa, argumentos e limites permanece no backend.

O scan é somente leitura do ponto de vista da interface. O resultado exibido não é apresentado como histórico persistido: ele vale para a sessão atual da tela.

## Triagem de riscos

A área principal é **Triagem de riscos**. Os findings são classificados nas severidades:

1. Crítica
2. Alta
3. Média
4. Baixa
5. Desconhecida

Antes de existir um scan concluído, as contagens aparecem como `—`. Isso representa ausência de evidência e evita comunicar `0` findings quando nenhum scan foi executado ou quando o resultado foi inconclusivo.

Depois de um scan concluído, as contagens passam a refletir somente os findings reais retornados pelo provider. Um scan concluído sem findings pode, então, mostrar zero com segurança.

## Findings

Quando há findings, eles são ordenados por severidade, depois por arquivo e linha. Cada item pode mostrar:

- categoria (`Secret` ou `Misconfiguration`);
- regra do provider;
- arquivo e linha, quando disponível;
- severidade;
- orientação de remediação, quando fornecida pelo provider.

A interface não inventa remediações nem transforma ausência de dados em sucesso.

## Estados inconclusivos

Se o provider falhar ou devolver saída inválida, a tela apresenta o scan como **Inconclusivo** e mantém as contagens de severidade sem números confiáveis. O diagnóstico retornado pela API é exibido para orientar a investigação.

Da mesma forma, falha ao consultar a disponibilidade do scanner não é interpretada como scanner ausente nem como ambiente seguro.

## Relação com as demais ferramentas

Segurança é uma aba normal do detalhe do projeto. Ela não possui header ou navegação paralelos e não substitui o shell compartilhado. O objetivo é permitir alternar entre **Readiness**, **Segurança**, **Diagnóstico** e as demais áreas mantendo o mesmo contexto do projeto.
