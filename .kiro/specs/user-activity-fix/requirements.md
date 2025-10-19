# Documento de Requisitos - Correção de Captura de Atividades

## Introdução

Este documento especifica os requisitos para corrigir a funcionalidade de captura de atividades dos usuários no bot Discord. O sistema atualmente não consegue acessar informações de presença e atividades dos usuários devido à falta de configurações adequadas de intents e implementação de eventos do Gateway WebSocket.

## Glossário

- **Discord_Bot**: O bot principal que opera no servidor Discord
- **Gateway_WebSocket**: Conexão em tempo real com o Discord para receber eventos
- **Presence_Intent**: Permissão privilegiada para acessar dados de presença dos usuários
- **User_Activity**: Informações sobre o que o usuário está fazendo (jogando, ouvindo música, etc.)
- **Presence_Update**: Evento do Discord que notifica mudanças na presença do usuário
- **Guild_Presences**: Intent específico do Discord para acessar dados de presença em servidores

## Requisitos

### Requisito 1

**História do Usuário:** Como desenvolvedor, eu quero que o bot capture atividades dos usuários em tempo real, para que a API possa retornar informações atualizadas sobre o que os usuários estão fazendo.

#### Critérios de Aceitação

1. QUANDO o Discord_Bot é inicializado, ELE DEVE configurar o Guild_Presences intent para acessar dados de presença
2. QUANDO um usuário atualiza sua atividade, O Discord_Bot DEVE receber o evento Presence_Update via Gateway_WebSocket
3. QUANDO uma atividade é recebida, O Discord_Bot DEVE armazenar as informações no cache para acesso via API
4. A captura de atividades DEVE funcionar para usuários online, idle, dnd e offline
5. SE o intent não estiver habilitado, ENTÃO O Discord_Bot DEVE registrar um erro explicativo no log

### Requisito 2

**História do Usuário:** Como usuário da API, eu quero receber informações precisas sobre atividades dos usuários, para que eu possa monitorar o que estão fazendo em tempo real.

#### Critérios de Aceitação

1. QUANDO uma requisição é feita para /api/users/{userId}/activity, A API DEVE retornar as atividades mais recentes do usuário
2. QUANDO um usuário está jogando um jogo, A API DEVE retornar o nome do jogo e detalhes como tempo de jogo
3. QUANDO um usuário está ouvindo música no Spotify, A API DEVE retornar título da música, artista e álbum
4. QUANDO um usuário tem Rich Presence ativo, A API DEVE retornar todos os detalhes disponíveis
5. SE não houver atividades, ENTÃO A API DEVE retornar um array vazio

### Requisito 3

**História do Usuário:** Como administrador do bot, eu quero que o bot tenha os intents corretos configurados, para que ele possa acessar dados de presença dos usuários mesmo tendo permissões de admin no servidor.

#### Critérios de Aceitação

1. O Discord_Bot DEVE incluir GuildPresences nos intents da configuração do cliente
2. QUANDO o intent GuildPresences não está habilitado no Developer Portal, O Discord_Bot DEVE exibir erro específico
3. O Discord_Bot DEVE validar se consegue acessar dados de presença durante a inicialização
4. QUANDO há problemas com intents, O Discord_Bot DEVE registrar logs detalhados para debugging
5. A configuração DEVE ser facilmente identificável no código para futuras modificações

### Requisito 4

**História do Usuário:** Como desenvolvedor, eu quero que o sistema seja eficiente no processamento de eventos de presença, para que não haja impacto na performance do bot.

#### Critérios de Aceitação

1. QUANDO eventos de presença são recebidos, O Discord_Bot DEVE processar apenas mudanças relevantes
2. O Discord_Bot DEVE implementar debouncing para evitar atualizações excessivas do cache
3. QUANDO o cache está cheio, O Discord_Bot DEVE remover entradas antigas automaticamente
4. O processamento de eventos DEVE ter latência menor que 100ms
5. SE houver muitos eventos simultâneos, ENTÃO O Discord_Bot DEVE usar uma fila para processamento

### Requisito 5

**História do Usuário:** Como usuário do sistema, eu quero que as informações de atividade sejam consistentes, para que eu possa confiar nos dados fornecidos pela API.

#### Critérios de Aceitação

1. QUANDO um usuário sai offline, O Discord_Bot DEVE manter a última atividade conhecida por 5 minutos
2. QUANDO dados de cache expiram, O Discord_Bot DEVE tentar obter informações atualizadas
3. A API DEVE incluir timestamp da última atualização em todas as respostas
4. QUANDO há conflito entre dados cached e em tempo real, O Discord_Bot DEVE priorizar dados mais recentes
5. SE um usuário não está no servidor, ENTÃO A API DEVE retornar erro 404 com mensagem apropriada