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

## Running it any other way

Forge is a normal Node.js app, so it also runs anywhere Node runs:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/forge.git
cd forge
npm install
npm run setup      # generates .env with this machine's own secrets
sudo npm start      # binds port 80; use PORT=3000 npm start to avoid sudo
```

Requirements: Node.js 18+. That's the only hard dependency for Forge itself.
(Docker is only required on the *target* servers Forge deploys onto — see
below — not on the box running Forge.)

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

## Security notes

- All secrets (GitHub token, AWS keys, per-project env vars, SSH private
  keys Forge generates) are encrypted at rest with AES-256-GCM, using a key
  generated uniquely per install (`npm run setup`) — never committed to git.
- The deploy pipeline validates every value that reaches a remote shell
  command (slugs, branch names, ports, env var names) before it's used.
- Target servers get `ufw` (deny-by-default, SSH + HTTP/S allowed),
  automatic security updates, and password SSH auth disabled.
- Forge itself has one login (session cookie, scrypt-hashed password) and
  no built-in TLS — see "what's next" above.

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
