# Próxima atividade — 005: Execução segura de scripts

## Objetivo

Permitir a execução das ações não destrutivas do catálogo de scripts por meio do
gerenciador de processos, sem aceitar comandos ou argumentos livres do navegador.

## Plano detalhado

1. Resolver cada item novamente no backend a partir de `projectId` e `scriptId`.
2. Detectar npm, pnpm, Yarn ou Bun por lockfile para scripts Node.
3. Criar o kind de processo `script` com estado, logs limitados, cancelamento e limpeza.
4. Recusar ações classificadas como destrutivas e exigir confirmação explícita para mutáveis.
5. Expor endpoints de iniciar, consultar, parar e ler logs com schemas completos.
6. Habilitar as ações na aba, mostrar progresso e invalidar polling ao trocar de projeto.
7. Adicionar testes de catálogo fechado, identidade do processo, concorrência e cancelamento.

## Fora do escopo inicial

- argumentos personalizados;
- terminal interativo;
- execução de ações destrutivas;
- múltiplos scripts simultâneos no mesmo projeto;
- histórico persistente de jobs.

## Critérios de aceite

- nenhuma linha de comando ou caminho é aceito do navegador;
- ações destrutivas sempre retornam erro controlado;
- processo e logs permanecem vinculados ao projeto autorizado;
- UI comunica confirmação, execução, sucesso, falha e cancelamento;
- `npm run typecheck`, `npm run build` e `npm test` passam.
