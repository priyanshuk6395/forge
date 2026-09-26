# Forge
## Product Requirements Document

**Version:** 1.0  
**Status:** Product Definition  
**Product Type:** Developer Infrastructure / DevOps Platform  
**Primary Platform:** Web  
**Initial Cloud:** AWS  
**Target Runtime:** Linux VMs / EC2  
**Core Philosophy:** Push code. Forge handles the machine.

---

# 1. Executive Summary

Forge is a developer-focused infrastructure platform that makes deploying and maintaining applications on virtual machines dramatically simpler.

It connects directly to GitHub, understands repositories and branches, provisions or connects to servers, builds and deploys applications, manages networking and security, monitors application and server health, and provides controlled self-healing capabilities.

The user should not need to constantly SSH into their server, remember Linux commands, configure reverse proxies, manually renew certificates, inspect logs, or interpret dozens of infrastructure metrics.

Forge converts infrastructure management from:

> **“How do I fix my server?”**

into:

> **“My application is unhealthy. Forge will tell me why and what it can safely do.”**

---

# 2. Problem Statement

Developers who want the flexibility and control of EC2/VMs often encounter a large operational burden.

Typical workflow:

1. Create EC2 instance.
2. Configure SSH.
3. Install dependencies.
4. Configure Git.
5. Clone repository.
6. Configure environment variables.
7. Install Docker.
8. Configure ports.
9. Configure firewall.
10. Configure Nginx.
11. Configure DNS.
12. Configure SSL.
13. Create deployment scripts.
14. Monitor processes.
15. Inspect logs.
16. Handle crashes.
17. Perform deployments manually.
18. Roll back failed deployments.
19. Patch the server.
20. Repeat everything for the next project.

This creates a significant cognitive burden for developers who primarily want to build software rather than operate infrastructure.

---

# 3. Product Vision

Forge should become the **operating layer between GitHub and a user's server**.

```text
Developer
    │
    │ Push code
    ▼
 GitHub
    │
    ▼
 ┌──────────────────────┐
 │        FORGE         │
 │                      │
 │ Git / CI / Security  │
 │ Deployment / Network │
 │ Monitoring / AI Ops  │
 └──────────┬───────────┘
            │
            ▼
          VM/EC2
            │
            ▼
        Application
```

The ideal user experience is:

> Connect GitHub → choose repository → choose server → deploy.

Everything else should be automated where safe.

---

# 4. Goals

## Primary Goals

### G1 — Simplify VM deployment

A developer should be able to deploy a GitHub repository to a Linux VM without manually configuring the server.

### G2 — Make GitHub the source of truth

Repositories, branches, commits, pull requests, releases, and deployment environments should be connected.

### G3 — Automate the deployment lifecycle

Forge should handle:

- checkout
- build
- test
- security checks
- artifact creation
- deployment
- health checks
- rollback

### G4 — Make infrastructure understandable

Users should see:

> Healthy / Needs attention / Critical

instead of being forced to interpret infrastructure metrics.

### G5 — Secure the default installation

Forge should follow secure-by-default principles for:

- SSH
- IAM
- secrets
- networking
- containers
- TLS
- permissions
- audit logging

### G6 — Enable safe self-healing

Forge should automatically perform predefined low-risk remediation actions.

### G7 — Provide AI-assisted operations

AI should help explain incidents, investigate failures, and recommend actions.

AI should **not** have unrestricted infrastructure access.

---

# 5. Non-Goals

The first version will NOT attempt to become:

- A Kubernetes replacement.
- A full AWS console replacement.
- A general-purpose cloud provider.
- A multi-cloud orchestration platform.
- A fully autonomous AI DevOps engineer.
- A database-as-a-service platform.
- A replacement for GitHub.

Forge operates **on top of infrastructure** rather than replacing the infrastructure provider.

---

# 6. Target Users

## Primary User

Independent developers and small engineering teams who:

- use GitHub
- deploy applications to VMs
- know programming but don't want to spend excessive time on DevOps
- prefer simple UI over repetitive CLI workflows
- want control over their own infrastructure

## Secondary User

Small startups that need:

- simple CI/CD
- deployment environments
- basic security
- monitoring
- rollback
- infrastructure visibility

---

# 7. Core Product Principles

## Principle 1 — Quiet by default

If everything is healthy:

> **Forge should stay quiet.**

No unnecessary alerts.

---

## Principle 2 — Secure by default

The easiest path should also be a reasonably secure path.

---

## Principle 3 — Explain before acting

Forge should explain:

> What happened  
> Why it happened  
> What it recommends  
> What it will change

before performing potentially impactful actions.

---

## Principle 4 — Deterministic systems control infrastructure

AI can investigate and recommend.

Deterministic policy engines perform infrastructure actions.

---

## Principle 5 — Git is central

Deployment should be associated with:

```text
Repository
→ Branch
→ Commit
→ Build
→ Release
→ Environment
→ Deployment
```

---

# 8. Core User Journey

## New Project

```text
Create Project
       ↓
Connect GitHub
       ↓
Select Repository
       ↓
Detect Application
       ↓
Select/Create Server
       ↓
Configure Environment
       ↓
Review Security
       ↓
Deploy
       ↓
Health Check
       ↓
Production
```

Expected experience:

**< 10 minutes for a basic Dockerized application.**

---

# 9. Feature Set

# 9.1 GitHub Integration

Forge must integrate with GitHub using OAuth/App-based authentication.

### Features

- Connect GitHub account.
- List repositories.
- Select repository.
- Detect default branch.
- Detect repository language.
- Detect Dockerfile.
- Detect Docker Compose.
- Detect common frameworks.
- Receive repository webhooks.
- Receive push events.
- Receive pull request events.
- Receive branch events.
- Receive release/tag events.

### Repository View

```text
Repository
────────────────────
owner/project

Language:
TypeScript

Default branch:
main

Branches:
main
develop
feature/*
```

---

# 9.2 Branch Management

Forge should treat branches as deployment entities.

Users can configure:

```text
main
    → Production

develop
    → Staging

feature/*
    → Preview
```

### Branch Policies

Supported policies:

- Protected branch.
- Require CI.
- Require security scan.
- Require approval.
- Prevent force deployment.
- Require successful health check.
- Require manual production approval.
- Automatic deployment.
- Manual deployment.

---

# 9.3 Environment Management

Supported environments:

- Production
- Staging
- Preview
- Development

Each environment contains:

```text
Environment
├── Server
├── Branch
├── Variables
├── Secrets
├── Domain
├── Deployment policy
├── Network policy
└── Security policy
```

---

# 9.4 Preview Environments

For feature branches:

```text
feature/payment
       ↓
Build
       ↓
Deploy
       ↓
preview-payment.forge.dev
```

When the branch is deleted:

```text
Branch deleted
      ↓
Preview destroyed
```

Preview lifecycle should be configurable.

---

# 9.5 Server Provisioning

Forge should support:

### Option A

Create a new AWS EC2 instance.

### Option B

Connect an existing Linux VM.

Initial supported OS:

- Ubuntu LTS

Future:

- Debian
- Amazon Linux
- Other distributions

---

# 9.6 Server Agent

A lightweight Forge Agent runs on each managed VM.

Responsibilities:

- Heartbeat.
- CPU telemetry.
- Memory telemetry.
- Disk telemetry.
- Network telemetry.
- Process monitoring.
- Container monitoring.
- Application health checks.
- Deployment execution.
- Log collection.
- Safe remediation actions.

The agent must run with the minimum permissions necessary.

---

# 9.7 Application Runtime

Initial runtime:

> Docker-first.

Supported inputs:

```text
Dockerfile
docker-compose.yml
forge.yaml
```

Future runtimes:

- Node.js
- Python
- Java
- Go
- Static applications
- systemd services

---

# 9.8 Forge Configuration

Optional:

```yaml
app:
  name: expense-api

runtime:
  type: docker

build:
  dockerfile: Dockerfile

deploy:
  port: 8080

health:
  endpoint: /health

environment:
  - DATABASE_URL
  - JWT_SECRET
```

Forge should auto-detect configuration whenever possible.

---

# 9.9 CI/CD Pipeline

Every deployment should have a visible pipeline.

```text
Checkout
   ↓
Install dependencies
   ↓
Lint
   ↓
Unit tests
   ↓
Build
   ↓
Security scan
   ↓
Build artifact
   ↓
Container scan
   ↓
Publish artifact
   ↓
Deploy
   ↓
Health check
   ↓
Smoke test
   ↓
LIVE
```

Each step must expose:

- Status
- Duration
- Logs
- Error
- Commit
- Artifact

---

# 9.10 Deployment Strategy

Initial strategy:

> Rolling replacement / controlled container replacement.

Future:

- Blue/green
- Canary
- Zero-downtime deployment
- Multi-server deployment

---

# 9.11 Deployment Safety

Before production deployment:

```text
✓ Build successful
✓ Tests successful
✓ Security scan successful
✓ Artifact available
✓ Environment variables available
✓ Server healthy
✓ Disk capacity sufficient
✓ Previous release available
```

If any mandatory condition fails:

> Deployment blocked.

---

# 9.12 Release Management

Every deployment creates an immutable release.

Example:

```text
Release #184

Commit:
8f32ab1

Branch:
main

Environment:
Production

Created:
15 Sep 2026

Status:
LIVE
```

Release history:

```text
#184  🟢 LIVE
#183  Previous
#182  Previous
#181  Previous
```

---

# 9.13 Rollbacks

One-click rollback:

```text
Production
Current: #184

[ Rollback to #183 ]
```

Forge should verify:

- Artifact exists.
- Required configuration exists.
- Target server is healthy.
- Rollback is permitted by policy.

---

# 9.14 Secrets Management

Secrets must never be committed to Git.

Supported secret types:

- Environment variables.
- API keys.
- Database credentials.
- Tokens.
- Certificates.

Secrets should be encrypted at rest.

UI:

```text
Production Secrets

DATABASE_URL      •••••••
JWT_SECRET        •••••••
STRIPE_SECRET     •••••••

[ Rotate ]
```

Secrets must never appear in:

- Pipeline logs.
- Application logs collected by Forge.
- Error messages.
- AI prompts unless explicitly authorized and redacted.

---

# 9.15 Secret Detection

Forge should scan:

- Git commits
- Build output
- Configuration

Potential credentials should trigger:

```text
🚨 Potential secret detected

Commit:
8f32ab1

Type:
AWS credential

Deployment:
BLOCKED
```

Where possible, Forge can guide the user through revocation and rotation.

---

# 9.16 Network Management

Forge should provide an abstraction over common networking configuration.

### Default model

```text
Internet
   ↓
Reverse Proxy
   ↓
Application
   ↓
Internal Services
```

Default principles:

- Deny unnecessary inbound traffic.
- Expose only required ports.
- Avoid direct application exposure where possible.
- HTTPS by default.
- Internal services should not be publicly accessible.
- SSH should use managed/restricted access where possible.

---

# 9.17 Firewall Management

UI:

```text
Network

Inbound

HTTPS      443    Public
HTTP       80     Public → Redirect
SSH        22     Restricted

Everything else
🔒 Blocked
```

Users can modify policies through Forge.

Dangerous configurations should generate warnings.

---

# 9.18 Domain & TLS

Forge should support:

- Custom domains.
- DNS configuration guidance.
- HTTPS.
- Certificate provisioning.
- Automatic renewal.
- Certificate health monitoring.

Dashboard:

```text
api.example.com

🟢 HTTPS
Certificate valid
Auto-renew enabled
```

---

# 9.19 Server Security

On provisioning, Forge should establish secure defaults such as:

- Disable password SSH authentication.
- Disable direct root login where appropriate.
- Use key/managed access.
- Least-privilege IAM.
- Minimal network exposure.
- Encrypted storage.
- Security updates.
- Audit logging.
- Non-root application execution.
- Container resource limits.
- Secure container configuration.

Security configuration must be idempotent.

Running the hardening process twice should not break the machine.

---

# 9.20 Monitoring

Forge collects only actionable telemetry initially.

### Server

- CPU
- RAM
- Disk
- Network
- Uptime

### Application

- Availability
- Error rate
- Response latency
- Container state
- Restart count

### Deployment

- Success rate
- Deployment duration
- Failure reason

---

# 9.21 Health Score

Instead of overwhelming users with metrics:

```text
Production

🟢 HEALTHY
```

Underlying components:

```text
Application       🟢
Server            🟢
Network           🟢
SSL               🟢
Security          🟢
Deployment        🟢
```

---

# 9.22 Incident Detection

Forge should detect:

- Application crash.
- Repeated container restarts.
- High disk usage.
- Memory exhaustion.
- Failed deployment.
- Health-check failures.
- Certificate problems.
- Unexpected port exposure.
- Security scan failures.

---

# 9.23 Self-Healing

Allowed automated actions should be policy-driven.

Examples:

```text
Restart crashed container
✓ Automatically allowed

Restart application service
✓ Automatically allowed

Rollback failed deployment
⚠ Policy dependent

Modify firewall
⚠ Approval required

Delete infrastructure
❌ Never autonomous by default
```

---

# 9.24 AI Operations Assistant

Users can ask:

> Why is my API down?

Forge gathers relevant telemetry, deployment history, logs, and configuration.

Example response:

```text
Production is unhealthy.

Likely cause:
The latest deployment caused the API container
to repeatedly run out of memory.

Evidence:
• Memory usage reached 96%
• Container restarted 7 times
• Problem started 4 minutes after deployment #184

Recommended action:
Rollback to #183.

[ Rollback ]
[ Investigate Further ]
```

AI must have:

- Read-only access by default.
- Explicit tool permissions.
- Action allowlists.
- Audit logging.
- Human approval for destructive actions.

---

# 9.25 Logs

Users should be able to view:

- Application logs.
- Deployment logs.
- Server logs.
- Agent logs.
- Security events.

Features:

- Search.
- Filter.
- Time range.
- Deployment correlation.
- Error grouping.

---

# 9.26 Audit Log

Every infrastructure-changing operation must be recorded.

Example:

```text
15:42
Priyanshu
Production deployment
#184

15:45
Forge
Container restarted

15:46
Forge
Health check passed
```

Audit records should include:

- Actor.
- Action.
- Resource.
- Timestamp.
- Result.
- Relevant deployment/release.
- Approval information.

---

# 10. Dashboard

The dashboard should prioritize **state over statistics**.

Example:

```text
Good afternoon 👋

Everything is under control.

┌───────────────────────────────┐
│       🟢 PRODUCTION           │
│                               │
│          HEALTHY              │
│                               │
│ Application     🟢            │
│ Server          🟢            │
│ Security        🟢            │
│ Network         🟢            │
│ SSL             🟢            │
└───────────────────────────────┘

Recent Activity

✓ Deployment #184 successful
✓ Security scan passed
✓ SSL certificate healthy

No action required.
```

---

# 11. Notification Strategy

Forge should avoid notification fatigue.

### Notify only when:

- User action is required.
- Deployment fails.
- Security issue is detected.
- Application remains unhealthy.
- Infrastructure requires attention.
- A predefined threshold is breached.

### Notification channels

Initial:

- In-app
- Email

Future:

- Slack
- Discord
- Teams
- Mobile push

---

# 12. AWS Architecture

Initial architecture:

```text
                     GitHub
                       │
                 Webhooks/API
                       │
                       ▼
                 API Gateway
                       │
                       ▼
                  Lambda/API
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Cognito         DynamoDB        SQS
        │                             │
        │                             ▼
        │                      Pipeline Workers
        │                             │
        │                 ┌───────────┴──────────┐
        │                 ▼                      ▼
        │                S3                     ECR
        │
        ▼
    Forge Web UI
                       │
                       ▼
                      SSM
                       │
                       ▼
                      EC2
                       │
              ┌────────┼─────────┐
              ▼        ▼         ▼
           Docker    Nginx    Forge Agent

Supporting AWS services:

CloudWatch
Secrets Manager
IAM
VPC
Route 53
ACM
CloudTrail
SNS
```

---

# 13. Security Architecture

Security must follow:

> **Zero trust + least privilege + explicit actions.**

## Control Plane

- Cognito authentication.
- JWT authorization.
- Project-level authorization.
- IAM roles.
- Encrypted data.
- Audit logs.

## Server

- SSM preferred over permanent SSH exposure.
- Short-lived credentials where possible.
- Agent authentication.
- Secure communication.
- Minimal permissions.

## Deployment

Artifacts should be immutable.

Pipeline workers should not receive unnecessary production credentials.

---

# 14. Data Model

Core entities:

```text
User
Organization
Project
Repository
Branch
Environment
Server
Deployment
Release
Pipeline
PipelineStep
Secret
Domain
Certificate
SecurityPolicy
NetworkPolicy
Incident
AuditEvent
```

Example relationship:

```text
Project
 ├── Repository
 ├── Servers
 ├── Environments
 │     ├── Deployments
 │     ├── Secrets
 │     ├── Domains
 │     └── Policies
 └── Audit Events
```

---

# 15. Permissions

Initial roles:

### Owner

Everything.

### Admin

Infrastructure and deployment management.

### Developer

Code/deployment visibility and non-destructive actions.

### Viewer

Read-only.

Sensitive operations require elevated permissions.

---

# 16. Reliability Requirements

Forge itself must avoid becoming a single point of failure for deployed applications.

If the Forge control plane goes offline:

> Existing applications must continue running.

The VM agent should maintain local runtime functionality independently.

Existing deployments must remain operational even if Forge is temporarily unavailable.

---

# 17. Failure Handling

### Forge unavailable

Existing application:

> Continue running.

### Agent unavailable

```text
Server
🟡 Agent disconnected
```

Application should continue running.

### Deployment fails

```text
Deployment failed
       ↓
Keep previous release
       ↓
Application remains online
```

### Health check fails after deployment

```text
Deployment #184
      ↓
Health check ❌
      ↓
Deployment marked failed
      ↓
Rollback according to policy
```

---

# 18. MVP

The first usable release should NOT implement everything.

## MVP Scope

### GitHub

- OAuth/App connection.
- Repository selection.
- Push webhook.
- Branch detection.

### AWS

- EC2 provisioning.
- IAM role.
- SSM.
- Basic security group.

### Server

- Ubuntu.
- Forge Agent.
- Docker.
- Basic hardening.

### Deployment

```text
GitHub
→ Build
→ Docker image
→ Deploy
→ Health check
```

### UI

- Project dashboard.
- Server dashboard.
- Deployment pipeline.
- Logs.
- Basic health status.

### Security

- Secret management.
- Basic vulnerability scanning.
- Secure default networking.
- Audit logs.

### Rollback

- Previous release.
- One-click rollback.

---

# 19. Phase 2

Add:

- Branch → environment mapping.
- Preview environments.
- Custom domains.
- TLS automation.
- Advanced network configuration.
- Automated server updates.
- Better monitoring.
- Notifications.
- Deployment approvals.

---

# 20. Phase 3

Add:

- AI incident investigation.
- Safe self-healing.
- Automated rollback.
- Anomaly detection.
- AI deployment analysis.
- Cost insights.
- Security recommendations.

---

# 21. Phase 4

Add:

- Blue/green deployment.
- Canary deployment.
- Multiple servers.
- Load balancing.
- Autoscaling.
- Multi-region deployments.
- Team organizations.
- Advanced RBAC.

---

# 22. Success Metrics

## Activation

Percentage of users who:

> Connect GitHub → deploy first application.

Target:

**> 70%**

---

## Time to First Deployment

Target:

**< 10 minutes**

for a supported Docker application.

---

## Deployment Success Rate

Target:

**> 95%**

for valid deployments.

---

## Manual SSH Reduction

Measure how frequently users need to manually access managed servers.

Goal:

> **80%+ reduction in routine SSH operations.**

---

## Recovery

Measure time from application failure to recovery.

Goal:

> Common recoverable incidents resolved within minutes.

---

# 23. Security Requirements

Forge must:

- Never store plaintext secrets.
- Never expose credentials in logs.
- Require authentication for infrastructure actions.
- Record infrastructure mutations.
- Validate every server command.
- Use allowlisted actions.
- Require confirmation for dangerous operations.
- Apply least-privilege permissions.
- Prevent arbitrary AI-generated shell execution by default.
- Validate configuration before applying it.
- Support rollback of configuration changes where possible.

---

# 24. Dangerous Operations

The following should require explicit user confirmation:

- Delete server.
- Delete environment.
- Destroy preview infrastructure.
- Modify production firewall.
- Rotate critical credentials.
- Change IAM permissions.
- Remove storage.
- Delete releases.
- Execute arbitrary shell commands.

AI must never silently perform destructive infrastructure operations.

---

# 25. UX Philosophy

Forge should feel like:

> **GitHub + Vercel-like deployment simplicity + EC2 control + an opinionated DevOps engineer.**

But it should retain the power of the underlying VM.

### Basic Mode

Simple:

```text
Deploy
Rollback
Logs
Health
Security
```

### Advanced Mode

Expose:

```text
Networking
IAM
Docker
Processes
Firewall
Server configuration
CloudWatch
Deployment strategy
```

The complexity is **hidden, not removed**.

---

# 26. Example End-to-End Scenario

Developer creates a repository:

```text
github.com/user/expense-api
```

They connect it to Forge.

Forge detects:

```text
Node.js
Dockerfile
Port: 8080
Health endpoint: /health
```

User selects:

```text
AWS
Mumbai
EC2
```

Forge provisions the server.

It configures:

```text
✓ IAM
✓ SSM
✓ Docker
✓ Security baseline
✓ Firewall
✓ Monitoring
✓ Forge Agent
```

User clicks:

> Deploy

Forge executes:

```text
Checkout
   ↓
Install
   ↓
Test
   ↓
Security Scan
   ↓
Docker Build
   ↓
ECR
   ↓
EC2
   ↓
Health Check
   ↓
LIVE
```

Dashboard becomes:

```text
🟢 Production

Everything is under control.

Last deployment:
#1 — successful

Security:
No issues

Application:
Healthy

No action required.
```

Later, developer pushes:

```text
feature/payment
```

Forge automatically creates:

```text
Preview Environment

payment-preview.forge.dev
```

PR is merged.

```text
main
 ↓
Production deployment
 ↓
Health check
 ↓
🟢 LIVE
```

Two hours later the application crashes.

Forge detects it.

```text
🔴 Production incident

API container crashed 4 times.

Likely cause:
Memory exhaustion.

Recommended:
Rollback #12 → #11

[ Rollback ]
```

If configured for automatic recovery:

```text
Forge:
Restarted container.

Health restored.

No action required.
```

The developer never opened SSH.

---

# 27. Product North Star

Forge should ultimately make this possible:

```text
Developer:

"I have a GitHub repository.
Run it on my AWS server."

Forge:

"Done."

Developer:

"Anything I need to worry about?"

Forge:

"No."

Developer:

"Cool."
```

That is the product.

---

# 28. Final Product Definition

**Forge is an infrastructure control plane for developers who want VM-level control without VM-level operational pain.**

It owns the complete path:

```text
CODE
 ↓
GITHUB
 ↓
BRANCH
 ↓
PIPELINE
 ↓
BUILD
 ↓
SECURITY
 ↓
ARTIFACT
 ↓
SERVER
 ↓
NETWORK
 ↓
TLS
 ↓
DEPLOYMENT
 ↓
HEALTH
 ↓
MONITORING
 ↓
RECOVERY
```

The ultimate success criterion is not:

> “How many metrics can Forge show?”

It is:

> **“How rarely does the developer need to think about the server?”**

**Forge should turn infrastructure from something the developer constantly manages into something they confidently delegate.**