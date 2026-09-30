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

# 2. Clone the repo (use whichever GitHub repo is your source of truth)
mkdir -p /opt && cd /opt
git clone git@github.com:<owner>/rundesk.git   # e.g. iamreebskhan/rundesk
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

## CI/CD (GitHub Actions)

- `.github/workflows/ci.yml` runs on every push/PR: lint, typecheck, API tests,
  migration-order check.
- `.github/workflows/deploy.yml` runs on push to `main`: it SSHes to the
  production host using the repo secrets `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_SSH_KEY`, then runs `git pull origin main && ./deploy/deploy.sh rebuild`.

## Moving to a different GitHub repo (after duplicating / forking)

GitHub does **not** copy Actions secrets or update the production server when a
repo is duplicated, so two things must be done by hand or the auto-deploy is a
no-op (the deploy job fails with `Error: missing server host`):

1. **Add the deploy secrets to the new repo** — *Settings → Secrets and
   variables → Actions* — set `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` to
   the same values the old repo used.

2. **Point the server at the new repo** (its `origin` was cloned from the old
   one, so `deploy.sh rebuild`'s `git pull origin main` would otherwise pull the
   wrong source):
   ```bash
   ssh <DEPLOY_USER>@<DEPLOY_HOST>
   cd /opt/rundesk
   git remote set-url origin git@github.com:<new-owner>/rundesk.git
   git fetch origin && git checkout main && git pull origin main
   ./deploy/deploy.sh rebuild      # builds web + api, restarts api (no migrations)
   ```
   Step 2 alone deploys the current `main` immediately; step 1 makes future
   pushes auto-deploy. Run `./deploy/deploy.sh migrate` as well only if there are
   new DB migrations to apply.

## The client's address, behind nginx

The API only ever talks to nginx (and to Docker's `docker-proxy`, which relays
the loopback port), so the socket it sees is the same for every visitor. Who
is really asking is the last entry of `X-Forwarded-For`: nginx appends the
address it saw (`$proxy_add_x_forwarded_for`) to whatever the client sent, so
every entry before the last is the client's own writing.

`TRUST_PROXY` says how many proxies stand in front of the API, and the API
trusts exactly that many hops. `docker-compose.prod.yml` sets it to 1 (and
`env.production.template` says the same), which is right for this stack. Every
per-address rule reads the result: sign-in's ten attempts a minute, sign-up's
ten, the public pages' budgets, and a workspace's IP allowlist.

- **Unset or `false`** means no proxy: fine for an API reached directly, but
  behind nginx every visitor is one address, so each limit is the whole site's.
- **`true`** is read as 1. (It used to trust every hop, which let a client name
  its own address in `X-Forwarded-For`.)
- **A CDN or load balancer in front of nginx** that appends too: set 2.
- Anything else stops the API at boot with a line naming `TRUST_PROXY`.

The API's boot log says which it is using: `Client address: X-Forwarded-For,
trusting the one proxy in front (TRUST_PROXY=1)`. To check it end to end, send
a forged header through nginx and read what the API saw, with a session of a
member of the workspace:

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'X-Forwarded-For: 198.51.100.1' \
  "https://<host>/api/v1/workspaces/<workspace-id>/security-settings"
```

Its `currentIp` must be your own address, not `198.51.100.1`, and not the
same address for two people on different networks.

Only nginx may reach the API's port. With 1 hop trusted, anything that reaches
the port directly could write the header nginx normally writes.

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

## Verifying a release

Two checks, in this order, both on the VPS after `deploy/deploy-prod.sh`:

```bash
bash deploy/verify-release.sh    # 55 checks — the API, the schema, the shipped bundle
node deploy/verify-ui.mjs        # 28 checks — a real browser driving the deployed app
```

The DM tab strip needs a DM to exist. If `verify-ui.mjs` skips it, open one:

```bash
bash deploy/make-dm.sh && node deploy/verify-ui.mjs
```

That creates an empty DM between the signed-in account and the first other
member — nothing is sent, and running it twice returns the same channel.

`verify-release.sh` needs nothing extra. `verify-ui.mjs` needs Playwright once —
installed **outside** this repo, because `npm i` inside a pnpm workspace fails on
the `link:` protocol used for internal packages (`EUNSUPPORTEDPROTOCOL`):

```bash
mkdir -p /opt/rundesk-pw && cd /opt/rundesk-pw
npm init -y >/dev/null && npm i playwright@1.56
npx playwright install --with-deps chromium
```

The script looks there on its own. Anywhere else, point at it with
`PLAYWRIGHT_DIR=/path/to/node_modules`. It exits 2 when it cannot find a
browser — a UI nobody looked at must not read as a UI that passed.

The split matters. `verify-release.sh` proves the endpoints answer and that the
bundle nginx is serving contains this release's code — it cannot prove anything
*renders*. `verify-ui.mjs` signs in through the real login form and clicks the
controls, which is the only way to catch a component that throws on mount or a
chunk that 404s.

It uses the site's real hostname (from `APP_URL` in `.env`) but pins it to
`127.0.0.1`, so the request carries the `Host` header nginx keys its vhost on
while never leaving the machine — no public DNS, no hairpin NAT, no egress.
Asking for `http://127.0.0.1` directly does *not* work: the Host would not
match `server_name`, nginx answers with its default vhost, and the SPA is
nowhere to be found. Set `NO_HOST_MAP=1` to resolve the hostname normally.

Health is deliberately narrow: an uncaught exception, a document/script/
stylesheet that would not load, or a 5xx. A 404 from the custom-domain probe
and a 401 before sign-in are the app asking a question and getting a
legitimate no — counting those reported a healthy deployment as broken.
