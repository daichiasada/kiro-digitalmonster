# デジタルモンスター / Digital Monster 🥚🐉

デジモン風の育成ゲームです。卵から孵化させ、お世話（餌やり・トレーニング・睡眠・清掃）とバトルを通じて育て、成長段階ごとに姿が進化します。成長期以降は **Amazon Bedrock（Claude）** を使ってモンスターと会話でき、成長段階が上がるほど賢いモデルに切り替わります。

> **Kiro University Challenge** 提出用プロジェクトです。TypeScript モノレポ + AWS CDK によるワンコマンドデプロイ構成になっています。
>
> 📝 **審査員の方へ**: 各レッスンをどの成果物でどう実演したかは [`SUBMISSION.md`](./SUBMISSION.md) にまとめています。

---

## 🎮 概要 / Overview

- 🥚 **孵化 → 成長 → 進化**: 成長段階ごとに姿（SVG スプライト）が変わります。
- 🍖 **お世話**: 餌やり・トレーニング・睡眠・清掃をワンタップで。
- ⚔️ **バトル**: 敵モンスターとの簡易バトル。勝敗でステータスが変化します。
- 📊 **ステータス**: HP・攻撃力(ATK)・防御力(DEF)。
- ⏰ **時間経過**: 放置した時間に応じて状態が変化（リアルタイム育成を簡易表現）。
- 💾 **セーブ**: ブラウザごとに発行される monsterId をキーに DynamoDB へ保存。認証なし。
- 💬 **会話AI**: 成長段階に応じて Bedrock の Claude モデルを切り替え。

---

## 🏗️ アーキテクチャ / Architecture

```
ブラウザ (React + Vite SPA)
      │  静的配信
      ▼
CloudFront ──► S3 (private, OAC)      ← フロントの dist/ と config.json を配置
      │  config.json の apiBaseUrl を参照
      ▼
API Gateway (HTTP API, CORS)
      │  Lambda 統合
      ▼
┌──────────────┬───────────────┬──────────────┬──────────────┐
│ getMonster   │ saveMonster   │ battle       │ chat         │
│ Lambda       │ Lambda        │ Lambda       │ Lambda       │
└──────┬───────┴──────┬────────┴──────┬───────┴──────┬───────┘
       │ R/W          │ W             │ R/W          │ R / InvokeModel
       ▼              ▼               ▼              ▼
            DynamoDB (Monsters, PK=id)        Amazon Bedrock (Claude)
```

- **フロント**: React + TypeScript (Vite)。`base: './'` でビルドし CloudFront 配下で動作。
- **バックエンド**: API Gateway (HTTP API v2) + Lambda (TypeScript, NodejsFunction/esbuild バンドル)。
- **データ**: DynamoDB（パーティションキー `id`、PAY_PER_REQUEST）。
- **会話AI**: Amazon Bedrock（Anthropic Claude）。
- **IaC**: AWS CDK (TypeScript)。`cdk deploy` でまとめて構築。

モノレポ構成:

| パッケージ | 役割 |
|---|---|
| `packages/shared` | 型・育成/進化/バトルロジック・Bedrock モデルマッピング（純粋関数 + `node:test`） |
| `packages/backend` | Lambda ハンドラ（getMonster / saveMonster / chat / battle） |
| `packages/frontend` | React + Vite のゲーム UI、ステージ別 SVG スプライト、API クライアント |
| `infra` | AWS CDK アプリ |

---

## 🧬 成長段階と Bedrock モデル / Growth Stages & Model Mapping

進化条件は **トレーニング回数 ＋ 経過時間** で簡易判定します（詳細は `packages/shared/src/stages.ts`）。

| 成長段階 | 英名 | 会話AI | デフォルト Bedrock モデルID |
|---|---|---|---|
| 幼年期（卵→赤ちゃん） | Baby | **会話なし** | ―（Bedrock を呼ばず定型の鳴き声を返します） |
| 成長期 | Rookie | Claude **Haiku** | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| 成熟期 | Champion | Claude **Sonnet** | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| 完全体 | Ultimate | Claude **Opus** | `us.anthropic.claude-opus-4-5-20251101-v1:0` |

デフォルトモデルIDは `packages/shared/src/bedrock-models.ts`（`BEDROCK_MODEL_IDS`）に定義されています。これらは Anthropic Claude の **クロスリージョン推論プロファイル ID**（`us.` プレフィックス付き）です。現行世代の Claude はオンデマンドでベアのファウンデーションモデルIDを直接呼び出せず、推論プロファイル経由での呼び出しが必要なためです。IDや提供状況はリージョン/アカウントによって異なるため、すべて上書き可能です。上書き方法は [Bedrock モデルIDの上書き](#-bedrock-モデルidの上書き--overriding-model-ids) を参照してください。

---

## ✅ 前提条件 / Prerequisites

1. **Node.js >= 18**（推奨 20 以上）と npm。
2. **AWS アカウント** と、設定済みの **AWS CLI 資格情報**（`aws configure` もしくは環境変数 / SSO）。デプロイ先アカウントに対する管理者相当の権限が必要です。
3. **Amazon Bedrock のモデルアクセス有効化**（最重要）:
   - AWS コンソール → **Amazon Bedrock** → **Model access**（モデルアクセス）ページを開く。
   - **Anthropic Claude Haiku / Sonnet / Opus**（デフォルトは Claude 4.5 系のクロスリージョン推論プロファイル）へのアクセスをリクエスト（有効化）する。
   - 有効化していないと、会話機能（chat Lambda）が `AccessDenied` で失敗します。
4. **リージョン**: `us-east-1`（バージニア北部）を推奨します。Claude 各モデルの提供状況・推論プロファイルの可用性はリージョンによって異なるため、まずは `us.` プレフィックス付きプロファイルが使える `us-east-1` が無難です。別リージョンを使う場合は、そのリージョンで上記 3 モデル（または上書き先のモデル）が利用可能か確認してください。

---

## 🚀 デプロイ手順 / Deploy (one command path)

リポジトリのルートで、以下を順番に実行します。

```bash
# 1) 依存関係のインストール（モノレポ全体）
npm install

# 2) ビルド
#    - shared をコンパイル
#    - frontend を Vite でビルドして packages/frontend/dist を生成
#    （backend は CDK の NodejsFunction/esbuild がデプロイ時にバンドルします）
npm run build

# 3) CDK でデプロイ
cd infra
npx cdk bootstrap        # そのアカウント/リージョンで初回のみ必要
npx cdk deploy
```

> `npm run build` を先に実行して **`packages/frontend/dist` を生成しておく**ことが必須です。CDK の `BucketDeployment` は synth 時に `dist` の存在を前提とします。

### 🔗 1 回のデプロイでフロントと API が自動で繋がる仕組み

デプロイ時、CDK は以下を同時に S3 バケットへ配置します。

- `packages/frontend/dist` のビルド成果物
- 生成した **`config.json`**（内容: `{ "apiBaseUrl": "<デプロイされた API のURL>" }`）

フロントは起動時にサイトルートの `/config.json` を取得し、その `apiBaseUrl` を API のベース URL として使います。したがって **API URL を知るための事前ビルドや 2 回デプロイは不要** で、`cdk deploy` 一発で CloudFront URL を開けばそのまま遊べます。

### 📤 出力の読み方 / Reading the outputs

`cdk deploy` 完了後、スタックの **Outputs** に以下が表示されます。

| 出力名 | 内容 |
|---|---|
| `CloudFrontUrl` | ブラウザで開く URL（ここを開けば遊べます） |
| `ApiUrl` | HTTP API のベース URL（`config.json` にも書き込まれます） |
| `BucketName` | フロントを配信している S3 バケット名 |
| `TableName` | セーブデータを保存する DynamoDB テーブル名 |

---

## 🔧 Bedrock モデルIDの上書き / Overriding model IDs

デフォルトのモデルIDは `packages/shared/src/bedrock-models.ts` にあります。上書きしたい場合は、環境変数または CDK コンテキストで指定できます（chat Lambda にのみ渡されます）。

環境変数で上書き:

```bash
export BEDROCK_MODEL_HAIKU=us.anthropic.claude-haiku-4-5-20251001-v1:0
export BEDROCK_MODEL_SONNET=us.anthropic.claude-sonnet-4-5-20250929-v1:0
export BEDROCK_MODEL_OPUS=us.anthropic.claude-opus-4-5-20251101-v1:0
cd infra && npx cdk deploy
```

CDK コンテキストで上書き:

```bash
npx cdk deploy \
  -c bedrockModelHaiku=us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  -c bedrockModelSonnet=us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  -c bedrockModelOpus=us.anthropic.claude-opus-4-5-20251101-v1:0
```

`ALLOWED_ORIGIN`（CORS 許可オリジン、デフォルト `*`）も環境変数またはコンテキスト `-c allowedOrigin=...` で指定できます。設定例は [`.env.example`](./.env.example) を参照してください。

---

## 💻 ローカル開発 / Local development

デプロイ済みの API に向けてフロントだけローカルで動かせます。

```bash
cd packages/frontend
# デプロイ出力の ApiUrl を指定
echo "VITE_API_BASE_URL=https://xxxxxxxx.execute-api.us-east-1.amazonaws.com" > .env.local
npm run dev
```

フロントは起動時にまず `/config.json` を探し、見つからなければビルド時の `VITE_API_BASE_URL` にフォールバックします（`packages/frontend/.env.example` 参照）。ローカルで `config.json` を使いたい場合は `public/config.json` を置く方法もあります。

共有ロジックのユニットテスト（依存ゼロ、`node:test`）:

```bash
npm run test   # = npm run test -w @ddm/shared
```

---

## 🧹 後片付け / Teardown

```bash
cd infra
npx cdk destroy
```

DynamoDB テーブルと S3 バケットは開発向けに `removalPolicy: DESTROY`（S3 は `autoDeleteObjects: true`）で作成しているため、スタック削除時にデータごと削除されます。本番用途では `infra/lib/digital-monster-stack.ts` の `removalPolicy` を `RETAIN` に変更してください。

---

## ✅ ビルド・デプロイ検証状況 / Build & deploy status

このプロジェクトは、上記「デプロイ手順」のフロー（`npm install` → `npm run build` → `cd infra && npx cdk bootstrap && npx cdk deploy`）で **実際にビルド・デプロイ済み** です。

- `npm install` / `npm run build`（`shared` → `backend` → `frontend` → `infra`）がグリーンで通ります。
- `packages/frontend/dist` が Vite で生成され、CDK の `BucketDeployment` が synth 時にこれを取り込みます。
- `npx cdk bootstrap` → `npx cdk deploy` が成功し、CloudFront 配信 + API Gateway + DynamoDB + Bedrock IAM を含むスタックがデプロイされます。デプロイ後は `cdk deploy` の **Outputs**（`CloudFrontUrl` / `ApiUrl` ほか）が表示され、`CloudFrontUrl` を開けばそのまま遊べます。

> 具体的な CloudFront / API の URL はデプロイのたびにアカウント・リージョンごとに新しく払い出されるため、本 README には固定値を記載していません。上記フローを実行すると、お手元のアカウントで同じ構成が再現できます。
>
> 初回は **Bedrock のモデルアクセス有効化**（上記「前提条件」3.）を忘れずに行ってください。有効化していないと、ビルド・デプロイ自体は成功しても会話/バトルの Bedrock 呼び出しが実行時に `AccessDenied` になります。

---

## 📁 ディレクトリ構成 / Layout

```
.
├── package.json            # npm workspaces ルート
├── tsconfig.base.json
├── .env.example
├── packages/
│   ├── shared/             # 型・ロジック・モデルマッピング（+ node:test）
│   ├── backend/            # Lambda ハンドラ
│   └── frontend/           # React + Vite ゲーム UI
└── infra/                  # AWS CDK アプリ
    ├── bin/app.ts
    └── lib/digital-monster-stack.ts
```
