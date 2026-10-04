# Forge

Push code. Forge handles the machine.

Forge is a self-hosted control plane that watches a GitHub repo, builds it
with Docker, and deploys it onto a Linux server you either already have or
let Forge spin up on AWS for you — all from a browser UI. No YAML pipelines,
no Kubernetes, no separate CI system.

This repo is both:
1. **The app you run** — Forge's own backend + UI.
2. **What Forge deploys** — your other projects, once Forge is up.

---

## Quick start: run Forge on a fresh EC2 instance

This is the "everything is UI-accessible" path — one paste, no SSH required
to get started.

1. **Fork or push this repo to your own public GitHub account.**
   Forge pulls its own code from a repo you control, so you can update it
   later just by pushing commits.

2. **Edit `userdata.sh`** at the root of this repo and change:
   ```bash
   REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/forge.git"
   ```
   to your repo's URL, then commit and push that change.

3. **Launch an EC2 instance:**
   - AMI: Ubuntu 22.04 or 24.04 LTS (x86_64)
   - Instance type: `t3.micro` is enough to run Forge itself
   - Security group: allow inbound **TCP 80** (the UI) and **TCP 22** (SSH,
     for you)
   - Advanced details → **User data**: paste in the contents of your edited
     `userdata.sh`

   Or via the AWS CLI:
   ```bash
   aws ec2 run-instances \
     --image-id ami-xxxxxxxx \
     --instance-type t3.micro \
     --key-name your-key-pair \
     --security-group-ids sg-xxxxxxxx \
     --user-data file://userdata.sh
   ```

4. **Wait about a minute**, then open `http://<the-instance's-public-ip>/`
   in a browser. You'll land on Forge's first-run setup wizard.

That's it — Forge is running, on its own EC2 instance, pulling itself from
your GitHub. From here everything else (connecting GitHub, adding servers,
deploying your other projects) happens in the UI.

**Re-running `userdata.sh` later** (e.g. `sudo bash /opt/forge/userdata.sh`
over SSH) pulls the latest commit from your repo and restarts the service —
that's how you update Forge itself.

---

## Running it locally (development)

Forge is a normal Node.js app with a React + TypeScript + Tailwind frontend.

### Backend + Frontend (development)
```powershell
# Clone your fork
git clone https://github.com/YOUR_GITHUB_USERNAME/forge.git
cd forge

# Install server and client dependencies
npm install
Push-Location client
npm install
Pop-Location

# Generate secrets
npm run setup

# Terminal 1: backend API (PowerShell)
$env:PORT='3000'
npm start

# Terminal 2: frontend dev server (Vite; proxies /api to port 3000)
Push-Location client
npm run dev
```

instead of `cd client && npm run dev` if your shell does not accept `&&`.
Open the Vite URL printed in Terminal 2. The first visit shows the owner
account setup screen. Leave Terminal 2 running while using the app.

### Production-like local run
```powershell
git clone https://github.com/YOUR_GITHUB_USERNAME/forge.git
cd forge
npm install
Push-Location client
npm install
npm run build
Pop-Location
npm run setup
npm start
```

The production-like server uses the `PORT` value in `.env` (default `80`);
set `$env:PORT='3000'` in PowerShell before `npm start` to run without
elevated permissions. The server requires Node.js 22+ to match the AWS SDK
runtime. The client toolchain requires Node.js 20.19+ (or 22.12+). Docker is only
needed locally for the AWS emulator described below and on target servers
Forge deploys to.

### Local EC2 API testing (Moto)

Forge can point its AWS SDK at a local EC2-compatible endpoint. The included
Compose service runs Moto, which lets you test the AWS connection check and
exercise EC2 API calls without AWS credentials or cloud resources:

```powershell
docker compose up -d aws-mock
docker compose ps
```

Start the backend in a separate PowerShell terminal with dummy credentials
(Moto accepts any values; do not put real AWS credentials here):

```powershell
$env:PORT='3000'
$env:AWS_REGION='us-east-1'
$env:AWS_ACCESS_KEY_ID='test'
$env:AWS_SECRET_ACCESS_KEY='test'
$env:FORGE_AWS_ENDPOINT_URL='http://127.0.0.1:5000'
npm start
```

Start the Vite client as above, create the owner account, then use
**Settings → AWS → Test connection**. The endpoint and region are shown in
Settings. `FORGE_AWS_AMI_ID` can select a mock AMI when exercising EC2 launch
API calls; Moto does not boot an operating system, provide a working guest
SSH server, or run Forge's remote bootstrap/deploy flow. Those workflows need
a real EC2 instance or an SSH-accessible Linux server.

Stop the emulator with `docker compose down`. It stores mock state in the
container's memory, so resources created during a test do not persist after
the container is removed.

---

## Using Forge once it's up

1. **Settings → GitHub**: paste a [personal access token](https://github.com/settings/tokens)
   with `repo` scope. This is how Forge lists your repos and builds them —
   no separate GitHub App registration needed.

2. **Servers**: either
   - **Connect existing** — point Forge at any Linux box you can already
     SSH into (IP + username + private key). Forge installs Docker and a
     firewall on it automatically the first time.
   - **Provision on AWS** — Forge creates the EC2 instance, key pair,
     and security group for you, using either AWS keys you paste into
     Settings → AWS, or (if Forge itself is running on an EC2 instance with
     an IAM role attached) that role automatically.

3. **Projects → New project**: pick a repo + branch, the port your app
   listens on, and a health-check path. Your repo needs a `Dockerfile` —
   Forge tells you if it can't find one.

4. **Deploy**: click Deploy. Forge SSHs into the target server, clones the
   repo, runs a secret scan and a container vulnerability scan, builds the
   image, and swaps the running container over — with the previous image
   kept around so **Rollback** is a one-click, one-image-swap operation.

5. **Auto-deploy**: in a project's Settings tab, click Enable — Forge
   registers a GitHub webhook so every push to the tracked branch deploys
   automatically.

---

## What's implemented vs. what's next

This is a real, working MVP, deliberately scoped down from a full platform:

**Implemented:** GitHub repo browsing via PAT, Dockerfile-based build &
deploy over SSH, one-click rollback via kept image tags, encrypted secrets/
env vars, EC2 provisioning *or* bring-your-own-server, health-check polling
with an optional auto-restart, push-to-deploy webhooks, committed-secret
scanning (gitleaks) and critical-CVE image scanning (Trivy) that block a
bad deploy, a full audit log, and a UI for all of it.

**Deliberately deferred** (noted here instead of half-built):
- **TLS / custom domains** — Forge itself and deployed apps run on plain
  HTTP. Put a TLS-terminating proxy (Caddy, an ALB, Cloudflare) in front of
  anything beyond quick/internal use.
- **Multiple users / SSO** — one owner account per Forge instance.
- **docker-compose / non-Dockerfile apps** — Dockerfile only, for now.
- **Preview environments per branch/PR** — one branch → one environment.
- **Email/Slack alerts** — incidents currently surface in-app only.

---

## Frontend Architecture

The Forge UI is a modern React 19 + TypeScript + Tailwind CSS v4 single-page application:

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 with Forge design tokens (CSS variables)
- **State/Data**: TanStack Query (React Query) for server state, caching, polling
- **UI Components**: Radix UI primitives + custom components
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React

### Project Structure
```
forge/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   └── ui/           # Base UI components (Button, Input, Card, etc.)
│   │   ├── pages/            # Page components (Dashboard, Projects, etc.)
│   │   ├── api/              # API client & React Query hooks
│   │   ├── hooks/            # Custom React hooks
│   │   └── lib/              # Utilities
│   ├── index.html
│   ├── package.json
│   └── dist/                  # Generated build output (ignored by Git)
├── server/                    # Express backend
├── userdata.sh               # EC2 user data script
└── package.json              # Server dependencies
```

### Development Commands
```powershell
# Start the backend (set PORT=3000 first for an unprivileged local port)
$env:PORT='3000'
npm start

# Start the frontend dev server with HMR (port 5173)
Push-Location client
npm run dev

# Build frontend for production
Push-Location client
npm run build
Pop-Location

# Lint the frontend
Push-Location client
npm run lint
Pop-Location
```

---

## Security notes

- All secrets (GitHub token, AWS keys, per-project env vars, SSH private
  keys Forge generates) are encrypted at rest with AES-256-GCM, using a key
  generated uniquely per install (`npm run setup`) — never committed to git.
- The deploy pipeline validates every value that reaches a remote shell
  command (slugs, branch names, ports, env var names) before it's used.
- Target servers get `ufw` (deny-by-default, SSH + HTTP/S allowed),
  automatic security updates, and password SSH auth disabled.
- The session cookie is `HttpOnly`, host-only, and `SameSite=Lax`. It is
  marked `Secure` for HTTPS requests, including TLS terminated by a trusted
  reverse proxy; the direct HTTP EC2 user-data setup remains compatible.
- Forge itself has one login (session cookie, scrypt-hashed password) and
  no built-in TLS — see "what's next" above.

---

## Browser E2E tests

With project dependencies installed and the Moto service running on port 5000:

```powershell
Push-Location client
npx playwright install chromium
npm run build
npm run test:e2e
Pop-Location
```

The suite starts Forge on an isolated port with a disposable data store. GitHub
responses and the SSH target are fixtures; Moto validates the EC2 API
connection, but real GitHub authentication, EC2 guest bootstrap, and SSH/Docker
deployment require external credentials and a reachable Linux server.

## Architecture, in short

```
Browser  ──►  Forge (Node/Express, this repo)  ──►  SSH  ──►  target server
                      │                                            │
                      ├─ JSON file store (./data/db.json)          ├─ git clone
                      ├─ GitHub REST API (PAT)                      ├─ gitleaks / trivy
                      └─ AWS SDK (EC2 provisioning, optional)        └─ docker build && run
```

No database server, no message queue, no build cluster — one Node process,
one JSON file, and SSH. That's what makes it something you can drop onto a
single EC2 instance with a user-data script and have it just work.