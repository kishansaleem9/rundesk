# Rundesk Production Deployment

Single-server Docker stack: Postgres + Redis + Meilisearch + NestJS API + Caddy (HTTPS reverse proxy serving the Vite SPA).

## First-time deploy on a fresh server

```bash
# 1. Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Clone the repo
mkdir -p /opt && cd /opt
git clone git@github.com:mrrjatt/rundesk.git
cd rundesk

# 3. Copy and edit the production env
cp deploy/env.production.template .env
nano .env

# 4. Bring everything up
./deploy/deploy.sh up

# 5. Apply schema and seed (first time only)
./deploy/deploy.sh migrate
```

After step 4, Caddy will issue a Let's Encrypt cert for `rundesk.theaura.agency` automatically — make sure DNS is already pointing at the server.

## Updating to a new release

```bash
cd /opt/rundesk
git pull
./deploy/deploy.sh rebuild
```

## Other commands

| Command | Purpose |
|---|---|
| `./deploy/deploy.sh logs` | Tail API + Caddy logs |
| `./deploy/deploy.sh down` | Stop everything (data persists) |
| `docker compose -f deploy/docker-compose.prod.yml exec postgres psql -U rundesk` | Open a psql shell |

## File layout

```
deploy/
├── Dockerfile.api            # NestJS container (ts-node-dev runtime)
├── Dockerfile.web            # SPA build → exports apps/web/dist
├── caddy/Caddyfile           # HTTPS, /api proxy, /realtime websocket, SPA fallback
├── docker-compose.prod.yml   # Full stack
├── deploy.sh                 # up | migrate | rebuild | logs | down
├── env.production.template   # Template for /opt/rundesk/.env
└── README.md                 # This file
```

## Default super admin (after `migrate`)

- Email: `admin@rundesk.internal`
- Password: `Admin@123!`

**Change this immediately after first login.**
