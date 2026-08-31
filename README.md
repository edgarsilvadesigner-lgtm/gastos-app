# Gastos

App de gestão de gastos partilhada entre Edgar e Nélia. Palavra-passe → escolha de utilizador → registo de despesas → dashboard.

## Correr localmente

```bash
npm install
npm start
```

Abre http://localhost:3000. Palavra-passe por omissão: `garlia` (define `APP_PASSWORD` para mudar).

## Deploy com Docker

```bash
cp .env.example .env
# edita .env: define SESSION_SECRET com uma string aleatória longa,
# e muda APP_PASSWORD se quiseres outra palavra-passe
docker compose up -d --build
```

A app fica disponível na porta 3000 do servidor (ajusta o mapeamento em `docker-compose.yml` ou coloca um reverse proxy / HTTPS à frente, ex. Caddy ou Nginx).

Os dados ficam guardados em `./data/expenses.json`, montado como volume — persistem entre reinícios e atualizações do container.

## Notas

- Sessão de autenticação válida por 90 dias (cookie assinado).
- Categorias definidas em `server/categories.js` — para adicionar/remover categorias, edita esse ficheiro.
- Sem base de dados externa: armazenamento em ficheiro JSON, suficiente para o volume de uso de 2 pessoas.
