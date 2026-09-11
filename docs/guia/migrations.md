# Guia da aba Migrations

> Parte do [Guia passo a passo do dashboard web](README.md).

A aba **Migrations** apresenta uma inspeção comum e somente leitura do estado de migrations do projeto. Ela não executa migrations, rollback, seed nem qualquer outro comando de banco.

## Como a tela é organizada

A experiência segue uma leitura em linha do tempo:

- o bloco de estado no topo resume se a inspeção está **Atualizada**, **Pendente**, **Indisponível** ou **Inconclusiva**;
- a linha do tempo mostra primeiro as migrations **Pendentes**, depois as **Aplicadas** mais recentes e, por fim, a própria **Inspeção** que produziu o estado;
- o painel de **Contexto** mantém visíveis o status, provider, banco, contagens e o modo somente leitura;
- a evidência técnica e o horário observado vêm do resultado real da inspeção;
- warnings retornados pelo backend permanecem explícitos no painel de contexto.

Quando existem mais de 20 migrations aplicadas, a interface mostra somente as 20 mais recentes e informa a quantidade total retornada pelo provider.

## Estados

O Dashboard não deduz sucesso apenas porque uma lista veio vazia. A classificação usa o status devolvido pelo contrato de migrations:

- **Atualizado**: não há migrations pendentes segundo a evidência disponível;
- **Pendente**: existem migrations aguardando aplicação;
- **Indisponível**: a inspeção não pôde produzir uma leitura confiável;
- **Inconclusivo**: a evidência atual não permite classificar o estado com segurança.

Em caso de falha ao consultar o provider, a tela mantém o erro explícito e oferece **Tentar novamente**.

## Somente leitura

A aba é deliberadamente informativa. Não existe botão para executar migration a partir dessa superfície. A lista, a evidência, os horários e as contagens servem para responder rapidamente três perguntas: qual é o estado atual, o que está pendente e qual inspeção sustenta essa conclusão.

Operações de banco que alteram estado continuam pertencendo às superfícies específicas que já oferecem confirmação e catálogo fechado de comandos.
