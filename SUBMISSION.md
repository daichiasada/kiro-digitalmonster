# Kiro University Challenge — 提出説明 / Submission

本リポジトリ **kiro-digitalmonster** は、デジモン風のモンスター育成 Web ゲーム（React + Vite /
AWS Lambda + API Gateway / DynamoDB / Amazon Bedrock / AWS CDK）です。以下に、要求された 7 つの
レッスンと 2 つのボーナスを **このリポジトリ内のどのファイルでどう実演したか** を示します。
ファイルパスは全てリポジトリルートからの相対パスです。

> ゲーム本体の概要・デプロイ手順は [`README.md`](./README.md) を参照してください。

---

## 1. 仕様主導型開発 / Spec-driven development

要件 → 設計 → 実装タスクの順に仕様を作成し、それに沿って実装しました。段階名・進化条件・モデル対応は
実コードと一致させています。

- [`.kiro/specs/digital-monster/requirements.md`](./.kiro/specs/digital-monster/requirements.md) — EARS 記法のユーザーストーリーと受け入れ基準
- [`.kiro/specs/digital-monster/design.md`](./.kiro/specs/digital-monster/design.md) — React+Lambda+DynamoDB+Bedrock+CDK の技術設計
- [`.kiro/specs/digital-monster/tasks.md`](./.kiro/specs/digital-monster/tasks.md) — 実装タスク分解（FEAT-001..005 に対応、完了にチェック）

## 2. 運営文書 / Steering documents

ワークスペース共通の運営文書を `inclusion: always` の YAML フロントマター付きで配置し、全作業で
自動参照されるようにしました。

- [`.kiro/steering/product.md`](./.kiro/steering/product.md) — ゲームの定義とコアルール（4 段階・両閾値進化・退化なし・モデル対応）
- [`.kiro/steering/tech.md`](./.kiro/steering/tech.md) — 技術スタック、ビルド/テスト、`env -u NODE_OPTIONS` とネットワーク制約
- [`.kiro/steering/structure.md`](./.kiro/steering/structure.md) — ディレクトリ構成とロジックの一元管理方針

## 3. フック / Hooks

ファイル保存イベントを起点にエージェントを自動実行するフックを 2 つ定義しました（JSON）。

- [`.kiro/hooks/run-shared-tests.kiro.hook`](./.kiro/hooks/run-shared-tests.kiro.hook) — `packages/shared/src/**/*.ts` 保存時に `node:test` を実行
- [`.kiro/hooks/sync-spec-on-handler-change.kiro.hook`](./.kiro/hooks/sync-spec-on-handler-change.kiro.hook) — ハンドラ/ルール変更時に仕様との整合を確認
- [`.kiro/hooks/README.md`](./.kiro/hooks/README.md) — 各フックの目的の説明（静的リポジトリでは実行を見せられないため）

## 4. プロパティベーステスト（IDEのみ）/ Property-based testing (IDE-only)

ランダム入力に対して成り立つべき性質（プロパティ）を検証するテストを追加しました。実際の共有
関数（`../game.ts`, `../stages.ts`, `../battle.ts`）を対象に、以下を多数のシード付きランダム
ケースで検証しています。

- お世話後も `0<=hp<=maxHp`・`atk,def>=0`
- `applyTimePassage` は退化しない（段階インデックスは単調非減少）
- `evolveStage` は 1 回で最大 1 段階しか進めない
- `simulateBattle(player,enemy,seed)` は同一シードで決定的・必ず終了・勝者が有効・`0<=playerHpAfter<=maxHp`
- `reviveMonster` は入力 HP0 のとき HP>=1 を返す

> **補足**: 本リポジトリはネットワーク制限環境で生成され `fast-check` を導入できないため、
> テストファイル先頭のコメントのとおり、**依存ゼロの最小 PBT ハーネス**（シード付き PRNG +
> ジェネレータ + ランナー）を手製しています。Kiro IDE のプロパティベーステスト機能がこのレッスンの
> 本体であり、IDE 上では同等のケース生成・縮小を機能が担います。

- [`packages/shared/src/__tests__/game.property.test.ts`](./packages/shared/src/__tests__/game.property.test.ts)

実行方法:

```bash
env -u NODE_OPTIONS node --experimental-strip-types --test packages/shared/src/__tests__/*.ts
```

## 5. パワー / Powers

プロジェクト固有の規約と再利用ワークフローを 1 つの Kiro Power としてパッケージ化しました。

- [`.kiro/powers/digimon-helper/power.json`](./.kiro/powers/digimon-helper/power.json) — マニフェスト（name/version/description/keywords/steering/skills）
- [`.kiro/powers/digimon-helper/steering/digimon-conventions.md`](./.kiro/powers/digimon-helper/steering/digimon-conventions.md) — 不変ルールの要約
- [`.kiro/powers/digimon-helper/skills/add-growth-stage.md`](./.kiro/powers/digimon-helper/skills/add-growth-stage.md) — 「新しい成長段階を追加する」端から端までのチェックリスト
- [`.kiro/powers/digimon-helper/README.md`](./.kiro/powers/digimon-helper/README.md) — Power の説明

## 6. モデルコンテキストプロトコル（MCP）/ Model Context Protocol

AWS 公式ドキュメントと CDK ガイダンスの MCP サーバーをワークスペースに登録しました。Bedrock の
モデルID/リージョン可用性や CDK ベストプラクティスをエージェントから参照するためです。

- [`.kiro/settings/mcp.json`](./.kiro/settings/mcp.json) — `aws-docs` と `aws-cdk` の MCP サーバー設定（`command`/`args`/`env`/`disabled`/`autoApprove`）
- [`.kiro/settings/README.md`](./.kiro/settings/README.md) — どのサーバーをなぜ入れたかの説明

## 7. エージェント (Agents)

> ユーザー提供のレッスン一覧では項目7が「通関業者」と表記されていますが、これは "Agents" の
> **機械翻訳由来の誤り** と考えられます。正式名称は公開時に
> [kiro.dev/2026/university](https://kiro.dev/2026/university/) で確認してください。

アーキテクト（計画）→ コーダー（1 機能ずつ実装）→ セマンティックレビュアー（レビュー）の
マルチエージェント・ループでビルドしました。計画状態とレビュー判定が `.agents/` にファイルとして
残っています。

- [`.agents/README.md`](./.agents/README.md) — マルチエージェント・ワークフローの説明
- [`.agents/tasks/task-digital-monster/task.json`](./.agents/tasks/task-digital-monster/task.json) / [`context.json`](./.agents/tasks/task-digital-monster/context.json) / `features/FEAT-001..005.json` — 計画と機能状態
- レビュー証跡（v1→v2→v3）:
  - [`.agents/tasks/task-digital-monster/2026-10-04-151615-review.md`](./.agents/tasks/task-digital-monster/2026-10-04-151615-review.md) — v1: `NEEDS_CHANGES`
  - [`.agents/tasks/task-digital-monster/2026-10-04-152533-review.md`](./.agents/tasks/task-digital-monster/2026-10-04-152533-review.md) — v2: `APPROVED`
  - [`.agents/tasks/task-digital-monster/2026-10-04-152905-review.md`](./.agents/tasks/task-digital-monster/2026-10-04-152905-review.md) — v3: `APPROVED`

---

## 【ボーナス】Kiro Web / クラウドセッション / クラウド構成

本プロジェクトは **Kiro のクラウド/Web セッション**（クラウドサンドボックス）上で構築しました。
ローカル環境と異なり、クラウドセッションではエージェントが隔離環境でコードを生成・検証します。
成果物は **AWS へ CDK でデプロイ**（= クラウド構成 / cloud config）する設計です。

- クラウド構成（IaC）: [`infra/`](./infra/) — とくに [`infra/lib/digital-monster-stack.ts`](./infra/lib/digital-monster-stack.ts)（S3+CloudFront、HTTP API v2、DynamoDB、Bedrock IAM スコープ）
- デプロイ手順: [`README.md`](./README.md) の「🚀 デプロイ手順 / Deploy (one command path)」

> デモビデオでは、ローカル開発（`npm run dev` でフロントのみローカル起動）と、クラウドへの
> `cdk deploy` による本番相当環境（CloudFront URL でそのまま遊べる）の違いを示します。

## 【ボーナス】Kiro パワーのパッケージ化 / Package a Kiro Power

レッスン5 の Power を、マニフェスト + steering + skill + README を含む配布可能なパッケージとして
まとめました（上記レッスン5 と同一の成果物）。

- [`.kiro/powers/digimon-helper/`](./.kiro/powers/digimon-helper/) — パッケージ一式（`power.json` にメタデータ、`steering/` と `skills/` に中身）

---

## レッスン → ファイル対応の早見表 / Quick map

| レッスン | 主な成果物 |
|---|---|
| 1 仕様主導型開発 | `.kiro/specs/digital-monster/{requirements,design,tasks}.md` |
| 2 運営文書 | `.kiro/steering/{product,tech,structure}.md` |
| 3 フック | `.kiro/hooks/*.kiro.hook` + `.kiro/hooks/README.md` |
| 4 プロパティベーステスト | `packages/shared/src/__tests__/game.property.test.ts` |
| 5 パワー | `.kiro/powers/digimon-helper/` |
| 6 MCP | `.kiro/settings/mcp.json` + `.kiro/settings/README.md` |
| 7 エージェント | `.agents/README.md` + `.agents/tasks/task-digital-monster/*-review.md` |
| ボーナス クラウド | `infra/` + `README.md` デプロイ節 |
| ボーナス Power 配布 | `.kiro/powers/digimon-helper/` |
