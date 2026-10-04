# digital-monster

A full-stack "digital monster" (Tamagotchi / Digimon-style) web app. You raise a
single monster per browser: train it, watch it evolve through four growth
stages, and once it is old enough, chat with it. The conversation is powered by
Amazon Bedrock, and the model gets smarter as the monster evolves.

No login. One browser = one monster, identified by a `clientId` generated in
`localStorage` and used as the DynamoDB partition key.

## Growth stages

Evolution is gated by **training count AND elapsed time since creation** (both
conditions must be met; stages never skip). Each stage uses a different Amazon
Bedrock (Anthropic Claude) model for conversation, except 幼年期, which cannot
talk at all.

| Stage    | 日本語               | Rank     | Bedrock model                                                   | Thresholds to enter         |
| -------- | -------------------- | -------- | --------------------------------------------------------------- | --------------------------- |
| Baby     | 幼年期 (卵→赤ちゃん) | starting | **NO conversation** (no Bedrock)                                | —                           |
| Rookie   | 成長期               | 1        | Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0`)       | ≥ 3 trainings AND ≥ 5 min   |
| Champion | 成熟期               | 2        | Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20240620-v1:0`) | ≥ 10 trainings AND ≥ 30 min |
| Ultimate | 完全体               | 3        | Claude 3 Opus (`anthropic.claude-3-opus-20240229-v1:0`)         | ≥ 25 trainings AND ≥ 2 h    |

**幼年期 (Baby) has no conversation.** The chat path short-circuits before any
Bedrock call and returns a canned "ばぶばぶ…" reply. Because of this, only the
other three stages ever invoke Bedrock, and the IAM policy reflects that: the
chat Lambda is the only function granted `bedrock:InvokeModel`, scoped to exactly
the Haiku / Sonnet / Opus model ARNs above.

The model ids live in one place, `@digital-monster/shared`
(`BEDROCK_MODEL_IDS` and `BEDROCK_MODEL_BY_STAGE`), and are consumed by both the
chat Lambda (at runtime) and the CDK stack (to build the IAM policy ARNs), so the
runtime and the infrastructure can never drift apart.

## Architecture (in words)

- **Frontend** — React + TypeScript built with Vite. Static assets (including one
  prepared image per growth stage) are uploaded to a **private S3 bucket** and
  served through a **CloudFront** distribution over HTTPS. The bucket is locked
  down with Origin Access Control (OAC); only CloudFront can read it. CloudFront
  does SPA fallback (403/404 → `index.html`).
- **API** — **Amazon API Gateway** (REST) exposes four routes, each wired to its
  own **AWS Lambda** function (TypeScript, bundled from the backend sources by
  CDK's `NodejsFunction`/esbuild). CORS is enabled.
  - `GET  /monster` — load the monster for a `clientId`.
  - `POST /monster` — save the monster.
  - `POST /train` — train once (increments count, recomputes stage, may evolve).
  - `POST /chat` — chat; 幼年期 returns a canned reply, other stages call Bedrock.
- **Persistence** — **Amazon DynamoDB** table, partition key `clientId`,
  on-demand (PAY_PER_REQUEST) billing. One item per browser.
- **Conversation AI** — **Amazon Bedrock** (Anthropic Claude). The chat Lambda
  selects Haiku / Sonnet / Opus based on the monster's stage; 幼年期 never calls
  Bedrock.
- **IaC** — **AWS CDK** (TypeScript) provisions everything above as a single
  stack for near one-command deploy.

```
Browser (localStorage clientId)
   │  HTTPS
   ▼
CloudFront ──(OAC)──▶ S3 (private, frontend/dist)
   │
   │  fetch(VITE_API_BASE_URL)
   ▼
API Gateway (REST, CORS)
   ├─ GET  /monster ─▶ getMonster Lambda ─┐
   ├─ POST /monster ─▶ saveMonster Lambda ─┤
   ├─ POST /train   ─▶ train Lambda ───────┼─▶ DynamoDB (PK clientId)
   └─ POST /chat    ─▶ chat Lambda ────────┘
                           │
                           └─▶ Amazon Bedrock (Haiku / Sonnet / Opus; Baby = none)
```

## Repository layout

npm workspaces monorepo:

```
digital-monster/
├── shared/     @digital-monster/shared — Stage enum, Bedrock model map, evolution logic
├── backend/    @digital-monster/backend — Lambda handlers (getMonster/saveMonster/train/chat) + libs
├── frontend/   @digital-monster/frontend — Vite React+TS SPA + per-stage image assets
├── infra/      @digital-monster/infra — AWS CDK (TS) app provisioning the whole stack
└── README.md   this file
```

- `shared/src/` — `types.ts` (Stage, Monster), `bedrock.ts` (model ids + stage map),
  `evolution.ts` (thresholds + `computeStage`/`nextStage`).
- `backend/src/handlers/` — the four Lambda entry points, each exporting `handler`.
- `backend/src/lib/` — DynamoDB client, Bedrock client + stage-gated reply, evolution helpers.
- `frontend/src/` — React app; stage images under `frontend/src/assets/monster/`.
- `infra/bin/app.ts` + `infra/lib/digital-monster-stack.ts` — the CDK app and stack.
- `infra/test/` — CDK assertions test (vitest).

## Deploy

Requirements for the deploying session:

- Active **AWS credentials** (an IAM role/user with permission to create the
  resources above). In Kiro Web, register the credentials and start a **new**
  session so they take effect.
- **Amazon Bedrock model access must be enabled** in the target account and
  region for Claude 3 Haiku, Claude 3.5 Sonnet, and Claude 3 Opus. Bedrock
  foundation models are opt-in per account/region (AWS console → Bedrock → Model
  access). Without this, the chat Lambda's `InvokeModel` calls will fail even
  though the IAM policy allows them.
- Node.js 20+ and network access to the npm registry.

### One-command-style flow

```bash
# 1. Install all workspaces (shared, backend, frontend, infra).
npm install

# 2. First-time-only CDK bootstrap of the target account/region.
cd infra
npx cdk bootstrap

# 3. First deploy. The frontend is deployed with whatever is currently in
#    frontend/dist; the stack prints ApiBaseUrl and SiteUrl as outputs.
npx cdk deploy --all
```

CDK bundles the Lambda handlers from `backend/src/handlers/*.ts` automatically
(esbuild), so you do not need a separate backend build step.

### Wiring the frontend to the API (two-pass)

The frontend reads `VITE_API_BASE_URL` **at build time**, but you only learn the
API URL **after** the first deploy. So it is a two-pass flow:

```bash
# After the first `cdk deploy --all`, copy the printed ApiBaseUrl, e.g.
#   DigitalMonsterStack.ApiBaseUrl = https://abc123.execute-api.<region>.amazonaws.com/prod/

# Back at the repo root, rebuild the frontend with that URL baked in:
cd ..
VITE_API_BASE_URL="https://abc123.execute-api.<region>.amazonaws.com/prod" npm run build -w frontend

# Redeploy: the S3 bucket + CloudFront now serve the API-aware build.
cd infra && npx cdk deploy --all
```

(Alternatively, set `VITE_API_BASE_URL` in `frontend/.env` before the second
`npm run build -w frontend`.) After the redeploy, open the `SiteUrl` output in a
browser.

### Outputs

The stack exposes two CloudFormation outputs:

- **`SiteUrl`** — the CloudFront HTTPS URL of the SPA.
- **`ApiBaseUrl`** — the API Gateway base URL (set `VITE_API_BASE_URL` to this).

### Teardown

```bash
cd infra && npx cdk destroy --all
```

The DynamoDB table and the site bucket use a `DESTROY` removal policy (this is a
demo), so they are deleted with the stack.

## ⚠️ Sandbox constraint (why this repo was not built/deployed here)

This repository was authored in a Kiro sandbox where the **npm registry is
blocked (HTTP 403)** and no AWS credentials are present. As a result,
`npm install`, `npm run build`, `cdk synth`, and `cdk deploy` were **NOT run in
the authoring environment**. All `package.json` files pin explicit, well-known
dependency versions so that `npm install` succeeds in a networked session, and
the TypeScript sources and the CDK assertions test are written to be
correct-by-construction. **Run `npm install`, the frontend build, and
`cdk deploy` in a networked, AWS-credentialed Kiro Web session** following the
steps above.
