# Próxima atividade

Validar o **Assistente IA** e a **Code review IA** em uma máquina com Ollama
local e um modelo com suporte a ferramentas, usando um projeto real de tamanho
médio.

Para o Assistente IA:

1. Iniciar uma solicitação e navegar por Git, Logs e Testes para confirmar que
   o atalho flutuante e o estado continuam atualizados.
2. Pedir uma alteração pequena em mais de um arquivo e verificar a prévia,
   expiração do token e a revalidação de versão antes de aplicar.
3. Medir a experiência com respostas lentas e, se necessário, ajustar o
   intervalo de consulta somente durante estado `running`.
4. Confirmar que reiniciar a API cancela a execução e que nenhum prompt fica
   persistido ou aparece em logs.

Para a Code review IA, trocar de sub-aba durante a execução, retornar após
alguns arquivos e confirmar a recuperação do progresso e dos comentários.
Avaliar uma futura persistência em disco para sobreviver ao reinício da API.
