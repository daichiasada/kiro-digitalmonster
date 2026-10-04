# 実装タスク / Implementation Plan — AIモンスター

> **仕様主導型開発（レッスン1）** の実装フェーズ。要件・設計を実装可能な単位へ分解したもの。
> 実際の実装は `.agents/tasks/task-digital-monster/`（FEAT-001..005）と対応しており、
> 完了済みタスクにはチェックを付けている。

- [x] 1. 共有ロジックパッケージ (`packages/shared`) — _要件 1,2,3,4,5_  （FEAT-001）
  - [x] 1.1 ドメイン型を定義（`types.ts`: Monster / Stats / DTO 群）
  - [x] 1.2 成長段階表と進化判定（`stages.ts`: STAGES, evolveStage, 両閾値ゲート）
  - [x] 1.3 育成ロジック（`game.ts`: feed/train/sleep/wake/clean, applyTimePassage,
        applyAllEvolutions, reviveMonster, validateMonster, chooseChatContext）
  - [x] 1.4 バトルシミュレーション（`battle.ts`: 決定的 PRNG + simulateBattle）
  - [x] 1.5 Bedrock モデルマッピング（`bedrock-models.ts`: 段階→tier→modelId, 上書き解決）
  - [x] 1.6 `node:test` ユニットテスト（stages/game/battle/model）

- [x] 2. バックエンド Lambda (`packages/backend`) — _要件 4,5,6_  （FEAT-002）
  - [x] 2.1 getMonster / saveMonster（DynamoDB R/W, validateMonster）
  - [x] 2.2 chat（chooseChatContext で段階解決 → Bedrock 呼び出し, 幼年期は定型応答）
  - [x] 2.3 battle（simulateBattle, 戦闘不能時 reviveMonster）

- [x] 3. フロントエンド (`packages/frontend`) — _要件 1,2,3,4,5_  （FEAT-003）
  - [x] 3.1 React + Vite UI（お世話ボタン, ステータス表示, 会話, バトル）
  - [x] 3.2 ステージ別 SVG スプライト
  - [x] 3.3 `useMonster` フック（applyTimePassage をティックで適用）
  - [x] 3.4 API クライアント（config.json の apiBaseUrl 参照 → VITE_API_BASE_URL フォールバック）

- [x] 4. インフラ (`infra`, AWS CDK) — _要件 7_  （FEAT-004）
  - [x] 4.1 DynamoDB テーブル
  - [x] 4.2 4 本の Lambda + HTTP API v2 + CORS
  - [x] 4.3 chat Lambda に Bedrock InvokeModel IAM をスコープ付与
  - [x] 4.4 S3+CloudFront（OAC）, BucketDeployment で dist/ と config.json 配置
  - [x] 4.5 CfnOutput（CloudFrontUrl / ApiUrl / BucketName / TableName）

- [x] 5. レビュー対応 (v1 → v2 → v3)  （FEAT-004 レビューサイクル）
  - [x] 5.1 二重進化時のステータス未リベースを修正
  - [x] 5.2 chat のクライアントフォールバック（未保存でも初回会話可）
  - [x] 5.3 saveMonster の深い検証、battle の revive、CORS 統一
  - [x] 5.4 複数段階オフラインキャッチアップ（applyAllEvolutions）
  - 証跡: `.agents/tasks/task-digital-monster/2026-10-04-15*-review.md`（v1/v2/v3）

- [x] 6. Kiro University 提出アーティファクト — _レッスン1..7 + ボーナス_  （FEAT-005）
  - [x] 6.1 仕様（本 specs/）
  - [x] 6.2 運営文書（`.kiro/steering/`）
  - [x] 6.3 フック（`.kiro/hooks/`）
  - [x] 6.4 プロパティベーステスト（`packages/shared/src/__tests__/game.property.test.ts`）
  - [x] 6.5 パワー（`.kiro/powers/digimon-helper/`）
  - [x] 6.6 MCP 設定（`.kiro/settings/mcp.json`）
  - [x] 6.7 エージェント文書（`.agents/README.md`）
  - [x] 6.8 審査員向け `SUBMISSION.md`
