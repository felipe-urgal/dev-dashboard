# Próxima atividade

A task 086 comparou as principais pendências com o estado real do código e
selecionou uma entrega operacional pequena, fora do arco de IDE/IA. O produto
já limita e mascara os logs de servidor, testes e scripts antes de devolvê-los
ao navegador, mas ainda não permite salvar o trecho seguro exibido na tela.

## Task 087 — Exportação segura de logs

### Objetivo

Permitir exportar, para um arquivo local, exatamente o snapshot de log já
autorizado, limitado e mascarado pela API, cobrindo servidor, testes e scripts
sem criar uma rota de download do arquivo bruto.

### Decisão principal

A exportação deve acontecer no navegador a partir do `content` já presente no
snapshot carregado pela interface. Uma utilidade compartilhada cria um `Blob`,
dispara o download e revoga o `ObjectURL` depois do uso.

A task não deve reler o log, aceitar caminho, pedir o arquivo original ao
servidor nem ampliar o teto atual de 262144 bytes. Conteúdo mascarado permanece
mascarado no arquivo exportado.

### Escopo

- criar uma utilidade frontend compartilhada para:
  - normalizar um nome de arquivo seguro;
  - montar texto UTF-8 com metadados mínimos;
  - criar e revogar o `ObjectURL` sem manter recursos após o download;
- incluir no arquivo:
  - projeto;
  - origem (`servidor`, `testes` ou `script`);
  - identificação pública da execução/processo quando disponível;
  - horário de captura;
  - indicação de truncamento;
  - indicação de mascaramento e quantidade de substituições;
  - conteúdo do snapshot, sem transformação que possa reintroduzir valores;
- adicionar a ação **Exportar log** nos painéis que já exibem logs de:
  - servidor;
  - execução de testes;
  - execução de scripts;
- desabilitar a ação quando não houver snapshot ou conteúdo exportável;
- manter o aviso visual existente quando houve mascaramento;
- usar nomes derivados somente de metadados públicos já carregados, removendo
  separadores de caminho e caracteres inadequados;
- adicionar testes unitários da utilidade e testes montados dos três fluxos;
- atualizar documentação de uso, segurança, roadmap, pendências e task.

### Critérios de aceite

- o usuário consegue baixar o trecho de log atualmente exibido nos três
  domínios;
- o arquivo contém o mesmo conteúdo mascarado retornado pela API;
- um snapshot truncado continua truncado e registra essa condição no cabeçalho;
- nenhum caminho de log, caminho absoluto ou conteúdo bruto adicional é
  solicitado pelo navegador;
- o nome do arquivo não permite criar diretórios ou interpretar segmentos de
  caminho;
- `ObjectURL` é revogado após o disparo do download;
- estado vazio não gera arquivo;
- testes comprovam que um segredo ausente do snapshot não reaparece na
  exportação;
- typecheck, build, testes e smoke E2E continuam aprovados.

### Testes esperados

- utilidade de exportação:
  - nome seguro para projeto/origem com caracteres especiais;
  - cabeçalho de snapshot normal, truncado e mascarado;
  - criação do `Blob`, clique no link e revogação do `ObjectURL`;
  - recusa de conteúdo vazio;
- componentes:
  - botão desabilitado antes de carregar conteúdo;
  - exportação usa o snapshot atual de servidor;
  - exportação usa o snapshot atual de teste;
  - exportação usa o snapshot atual de script;
  - conteúdo mascarado do mock é preservado sem incluir o valor original.

### Fora do escopo

- download do arquivo bruto completo;
- nova rota HTTP de exportação;
- escolha de diretório pelo servidor;
- formato ZIP, JSON estruturado ou pacote com múltiplos logs;
- exportação do histórico inteiro de execuções;
- aumento do limite de leitura;
- compartilhamento remoto ou upload automático;
- novos padrões de mascaramento, salvo se um teste revelar regressão real na
  proteção atual.
