---
inclusion: always
---

# 技術運営文書 / Tech Steering

> **運営文書（レッスン2）**。技術スタック・ビルド/テスト・サンドボックス制約を定義する。

## スタック / Stack

- **言語**: TypeScript（モノレポ、npm workspaces）。
- **フロント**: React + Vite（S3+CloudFront へ静的配信）。
- **バックエンド**: AWS Lambda + API Gateway (HTTP API v2)。
- **データ**: DynamoDB（PK=`id`, PAY_PER_REQUEST）。
- **会話AI**: Amazon Bedrock（Anthropic Claude: Haiku/Sonnet/Opus）。
- **IaC**: AWS CDK（TypeScript）。`cdk deploy` でまとめて構築。
- **テスト**: Node 組み込み `node:test`（`packages/shared` の純粋ロジックを依存ゼロで検証）。

## パッケージ / Packages

| パッケージ | 役割 |
|---|---|
| `packages/shared` | 型・ゲームルール（純粋関数）・Bedrock モデルマッピング。**ルールの単一の置き場所** |
| `packages/backend` | Lambda ハンドラ（getMonster/saveMonster/chat/battle） |
| `packages/frontend` | React + Vite UI |
| `infra` | AWS CDK アプリ |

## ⚠️ サンドボックス制約（重要）/ Sandbox constraints

このリポジトリはネットワーク制限サンドボックス（INTEGRATIONS_ONLY）で生成された。

1. **`NODE_OPTIONS` が存在しないファイルを指すため、全ての node/npm/npx/tsc は
   `env -u NODE_OPTIONS` を前置して実行する。** 前置しないと MODULE_NOT_FOUND でクラッシュする。
2. 外部パッケージレジストリがブロックされ **`npm install` できない**。そのため生成時には
   `vite build` / `cdk synth` / `cdk deploy` は実行していない（コードは正しく書かれており、
   接続環境で `npm install` 後にビルド・デプロイできる）。
3. 新しい依存（例: fast-check）を導入する提案はしない。オフラインで動くものだけを書く。

## ビルド / Build

```bash
npm install          # 接続環境で
npm run build        # shared → backend → frontend(vite) → infra(tsc)
cd infra && npx cdk bootstrap && npx cdk deploy
```

## テスト / Test（サンドボックス内で実行可能な唯一のゲート）

```bash
# 共有ロジックのユニット + プロパティベーステスト（依存ゼロ）
env -u NODE_OPTIONS node --experimental-strip-types --test packages/shared/src/__tests__/*.ts
```

- 型チェックのみ: `env -u NODE_OPTIONS tsc --noEmit --skipLibCheck <file>`。
- JSON 妥当性: `python3 -c "import json; json.load(open('<file>'))"`。

## コーディング指針 / Conventions

- ゲームルールは `packages/shared` に純粋関数（入力を変更しない、新しいオブジェクトを返す）で書く。
- フロント/バックエンドは共有ロジックを **再実装せず import** する。
- Bedrock モデルIDは環境変数で上書き可能に保つ（`resolveModelId`）。
