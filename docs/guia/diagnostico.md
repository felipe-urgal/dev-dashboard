# Guia da aba Diagnóstico

> Parte do [Guia passo a passo do dashboard web](README.md).

A aba **Diagnóstico** agrega checks locais somente leitura para responder se o projeto possui sinais claros de ambiente saudável, atenção ou bloqueio.

Ela não instala ferramentas, não executa correções automáticas e não transforma ausência de evidência em estado verde.

## O que aparece

A tela segue um resumo operacional:

- estado agregado do Project Doctor;
- quantidade de checks aprovados em relação ao total coletado;
- quantidade de pendências, considerando warnings, falhas e checks não verificados;
- horário da coleta;
- faixa semântica com a conclusão geral;
- categorias **Projeto**, **Runtimes**, **Dependências** e **Configuração** em linhas expansíveis;
- resumo e evidência sanitizada de cada check;
- recomendação e ação de navegação quando existe uma ferramenta adequada para investigar ou corrigir.

Ao expandir uma categoria, os checks aparecem na própria linha de contexto, sem abrir outra página. Os destinos apontam para superfícies atuais como Servidor, Banco de dados, Dependências, Variáveis de ambiente ou outra ferramenta responsável. A ação sugerida apenas navega para a ferramenta responsável; ela não executa a correção automaticamente.

## Fontes

O Doctor pode combinar evidências como:

- existência/estrutura do projeto;
- runtime/package manager e requisitos detectados pelo Toolchain Doctor;
- dependências locais verificáveis;
- Environment Contract e arquivos reconhecidos;
- banco/serviços quando aplicável;
- portas e outros diagnósticos operacionais já disponíveis.

Cada domínio mantém sua regra própria. O Doctor agrega o resultado; não deve duplicar parsing ou heurísticas já pertencentes a Project Profile, Toolchain Doctor, Environment Contract ou Port Registry.

## Falhas parciais

Uma fonte indisponível não precisa derrubar todas as outras. O relatório deve distinguir `unknown`/atenção/bloqueio conforme a evidência disponível e nunca afirmar saúde completa com base em uma coleta incompleta.

Se a coleta inicial falhar, a tela apresenta o erro e permite tentar novamente. Ao trocar de projeto, o relatório anterior é descartado enquanto a nova coleta está em andamento.

## Segurança

- nenhum instalador é executado pela aba;
- valores de secrets não são promovidos para o relatório;
- comandos de inspeção, quando necessários, vêm de catálogo fechado;
- paths são derivados do Project conhecido;
- a ação sugerida apenas navega para a ferramenta responsável, sem executar mutação automaticamente.

## Relação com outras superfícies

A **Central de Atenção** pode consumir um estado bloqueado do Doctor para destacar o projeto na home.

**Release Readiness** também pode usar o resultado do Doctor como evidência, mas isso continua somente leitura: readiness/doctor não autorizam merge, push ou deploy.

Detalhes técnicos: [`../architecture/toolchain-doctor.md`](../architecture/toolchain-doctor.md), [`../architecture/project-profile.md`](../architecture/project-profile.md) e [`../architecture/release-readiness.md`](../architecture/release-readiness.md).
