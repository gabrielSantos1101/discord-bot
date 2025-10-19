# Discord Bot API

Bot do Discord com API REST integrada para monitoramento de atividades de usuário e gerenciamento automático de canais.

## Configuração

1. Clone o repositório
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

   Edite o arquivo `.env` com suas configurações.

4. Compile o projeto:

   ```bash
   npm run build
   ```

5. Execute o bot:
   ```bash
   npm start
   ```

## Desenvolvimento

Para desenvolvimento com hot reload:

```bash
npm run dev
```

Para executar testes:

```bash
npm test
```

Para linting:

```bash
npm run lint
```

## Estrutura do Projeto

```
src/
├── bot/          # Serviços do bot Discord
├── api/          # API REST
├── models/       # Modelos de dados
├── services/     # Serviços compartilhados
├── utils/        # Utilitários
└── index.ts      # Ponto de entrada
```

## Requisitos

- Node.js >= 18.0.0
- Redis (para cache)
- Token do bot Discord
