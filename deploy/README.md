# Rundesk Production Deployment

Single-server Docker stack: Postgres + Redis + Meilisearch + NestJS API.
The Vite SPA is built into `apps/web/dist` and served as static files by
the host's existing nginx (which also handles TLS via certbot).

This stack coexists with other apps on the host because it does **not**
bind to ports 80/443 itself — only `127.0.0.1:3010` (API).

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

# 4. Bring up containers
./deploy/deploy.sh up

# 5. Apply migrations and seed (first time only)
./deploy/deploy.sh migrate

# 6. Install nginx vhost + Let's Encrypt SSL
./deploy/deploy.sh nginx
```

DNS for `rundesk.theaura.agency` must already point at the server before
step 6 (so certbot can complete the HTTP-01 challenge).

## Updating to a new release

```bash
cd /opt/rundesk
./deploy/deploy.sh rebuild
```

This pulls latest code, rebuilds web + api, and restarts the api container.

## Other commands

| Command | Purpose |
|---|---|
| `./deploy/deploy.sh logs` | Tail API logs |
| `./deploy/deploy.sh down` | Stop all containers (data persists) |
| `docker exec -it rundesk-postgres psql -U rundesk` | psql shell |

## File layout

```
deploy/
├── Dockerfile.api                              # NestJS container
├── Dockerfile.web                              # SPA build → apps/web/dist
├── docker-compose.prod.yml                     # postgres + redis + meili + api
├── nginx/rundesk.theaura.agency.conf           # Host nginx vhost
├── deploy.sh                                   # up | migrate | nginx | rebuild | logs | down
├── env.production.template                     # Template for /opt/rundesk/.env
└── README.md                                   # This file
```

## Default super admin (after `migrate`)

- Email: `admin@rundesk.internal`
- Password: `Admin@123!`

**Change this after first login.**

## Troubleshooting

- **`./deploy/deploy.sh nginx` fails with cert error** — DNS isn't pointing
  at the server yet, or port 80 isn't reachable. Check with `dig +short rundesk.theaura.agency`.
- **`502 Bad Gateway`** — API container is down. Check `./deploy/deploy.sh logs`.
- **Migration failures** — deploy uses non-interactive `drizzle-kit migrate`. If a constraint is being added, ensure the migration includes any necessary data cleanup (e.g. dedupes) before the constraint.
- **Schema drift in old environments** — deploy scripts detect missing core tables/constraints. A destructive full `public` schema reset is now **opt-in** and only happens when `ALLOW_SCHEMA_RESET=true` is set in the environment.
- **`docker compose` not found** — install the v2 plugin:
  `curl -SL https://github.com/docker/compose/releases/download/v2.34.0/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose`
