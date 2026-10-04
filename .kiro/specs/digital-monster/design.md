# 設計書 / Design — AIモンスター

> **仕様主導型開発（レッスン1）** の設計フェーズ。要件（`requirements.md`）を満たす技術設計を
> 記述する。本書の内容は実装（`packages/*`, `infra/`）と一致する。

## 1. アーキテクチャ概要 / Overview

```
ブラウザ (React + Vite SPA)
      │  静的配信
      ▼
CloudFront ──► S3 (private, OAC)      ← dist/ と config.json
      │  config.json の apiBaseUrl を参照
      ▼
API Gateway (HTTP API v2, CORS)
      │  Lambda 統合
      ▼
┌──────────────┬───────────────┬──────────────┬──────────────┐
│ getMonster   │ saveMonster   │ battle       │ chat         │
└──────┬───────┴──────┬────────┴──────┬───────┴──────┬───────┘
       ▼              ▼               ▼              ▼
            DynamoDB (Monsters, PK=id)        Amazon Bedrock (Claude)
```

## 2. モノレポ構成 / Monorepo layout

| パッケージ | 役割 | 主なファイル |
|---|---|---|
| `packages/shared` | 型・育成/進化/バトルロジック・モデルマッピング（純粋関数 + `node:test`） | `types.ts`, `stages.ts`, `game.ts`, `battle.ts`, `bedrock-models.ts` |
| `packages/backend` | Lambda ハンドラ | `getMonster` / `saveMonster` / `chat` / `battle` |
| `packages/frontend` | React + Vite UI、ステージ別 SVG | `useMonster` フック, API クライアント |
| `infra` | AWS CDK アプリ | `infra/lib/digital-monster-stack.ts` |

**設計原則:** ゲームルール（段階表・進化条件・バトル・モデル対応）は `packages/shared` に
純粋関数として一元化し、フロント・バックエンド・CDK の IAM が同じ定義を参照する。これにより
クライアントとサーバーで挙動が食い違わない。

## 3. ドメインモデル / Domain model

`Monster` は `id, name, stageId, stats{hp,maxHp,atk,def}, trainingCount, careCounters,
bornAt, lastUpdatedAt, isSleeping, dirty, hungryLevel` を持つ（`types.ts`）。

### 成長段階表（`stages.ts` と一致）

| stageId | 表示 | 会話 | モデル tier | ベース stats | 進化条件(次段へ) |
|---|---|---|---|---|---|
| `baby` | 幼年期 | 不可 | none | hp20/atk5/def3 | train>=2 & 1分 |
| `rookie` | 成長期 | 可 | haiku | hp40/atk10/def6 | train>=6 & 5分 |
| `champion` | 成熟期 | 可 | sonnet | hp70/atk18/def12 | train>=12 & 15分 |
| `ultimate` | 完全体 | 可 | opus | hp110/atk28/def20 | —（最終段階） |

### 進化のアルゴリズム

- `evolveStage(monster, now)` は **1 段階だけ** 進める純粋関数（トレーニング回数 AND 経過時間の
  両方を要求）。
- `applyAllEvolutions`（`game.ts` 内）が `evolveStage` を変化が止まるまで繰り返し、各段で
  `applyEvolution` によりステータスをリベース（HP 比率維持）。ループは `STAGES.length` で上限。

## 4. API 設計 / HTTP API

| メソッド+パス | ハンドラ | 内容 |
|---|---|---|
| `GET /monster/{id}` | getMonster | ロード（404→孵化フロー） |
| `POST /monster` | saveMonster | 保存（`validateMonster` で構造検証） |
| `POST /chat` | chat | 会話（`chooseChatContext` で段階解決、Bedrock 呼び出し） |
| `POST /battle` | battle | バトル（`simulateBattle`、戦闘不能なら `reviveMonster`） |

## 5. 会話AI / Bedrock 設計

- 段階→モデル tier の対応は `modelKeyForStage`、具体的なモデルIDは `BEDROCK_MODEL_IDS`
  （`bedrock-models.ts`）。環境変数で上書き可（`resolveModelId`）。
- サーバー記録が存在すればその段階を正とする（段階詐称でモデル格上げを防止）。

## 6. インフラ設計 / IaC（`infra/lib/digital-monster-stack.ts`）

- DynamoDB: `Monsters`（PK `id`, PAY_PER_REQUEST, 開発向け removalPolicy: DESTROY）。
- Lambda: `NodejsFunction`（esbuild バンドル）。chat Lambda にのみ Bedrock `InvokeModel` を
  スコープした IAM を付与。
- API Gateway: HTTP API v2、CORS は `allowedOrigin`（既定 `*`）で統一。
- S3+CloudFront: private バケット + OAC。`BucketDeployment` で `dist/` と `config.json` を配置。

## 7. テスト戦略 / Testing

- `packages/shared` の純粋ロジックは `node:test` でユニットテスト（依存ゼロ）。
- **プロパティベーステスト（レッスン4）**: `packages/shared/src/__tests__/game.property.test.ts`
  で、お世話のステータス不変条件・退化しないこと・1段階進化・バトルの決定性/終了性・revive 下限を
  ランダム入力で検証（オフライン環境のため fast-check 不使用、手製の最小 PBT ハーネス）。

## 8. 環境制約 / Sandbox constraints

ネットワーク制限サンドボックスで生成したため `npm install` / `vite build` / `cdk synth` は
生成時に実行していない。全 node ツールは `env -u NODE_OPTIONS` を前置する必要がある
（詳細は `.kiro/steering/tech.md`）。
