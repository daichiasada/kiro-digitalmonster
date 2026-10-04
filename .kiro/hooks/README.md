# エージェントフック / Agent Hooks

> Kiro の **フック（Hooks, レッスン3）**。ファイル保存などのイベントを起点に、エージェントへの
> プロンプトを自動実行する仕組み。静的リポジトリでは実行の様子を見せられないため、各フックの
> 目的をここに説明する。各フック定義は `*.kiro.hook`（JSON）で、Kiro IDE のフック UI から
> 有効化・実行される。

## フック一覧 / Hooks

### 1. `run-shared-tests.kiro.hook` — 共有ロジックのテストを実行

- **トリガー**: `packages/shared/src/**/*.ts` の保存（`fileEdited`）。
- **動作**: 依存ゼロの `node:test` スイート（ユニット + プロパティベーステスト）を
  `env -u NODE_OPTIONS node --experimental-strip-types --test packages/shared/src/__tests__/*.ts`
  で実行し、結果を要約。失敗時は原因と修正案を提示させる。
- **狙い**: ゲームルールを一元管理している `packages/shared` の回帰を保存のたびに即検知する。

### 2. `sync-spec-on-handler-change.kiro.hook` — ハンドラ変更時に仕様を同期

- **トリガー**: `packages/backend/src/**/*.ts` および `stages.ts`/`game.ts`/`battle.ts` の保存。
- **動作**: `.kiro/specs/digital-monster/` の requirements/design/tasks と実装の整合を確認させ、
  ずれがあれば更新案を提示させる。
- **狙い**: 仕様主導型開発（レッスン1）の整合性を保ち、実装と仕様のドリフトを防ぐ。

### 3. `triage-issues-on-task-complete.kiro.hook` — タスク完了時に Issue を参照して対応

- **トリガー**: 手動実行（`userTriggered`）。一連の会話（タスク）が一区切りしたときに、フック UI の
  ボタンから実行する。
- **動作**: GitHub リポジトリの未解決 Issue を REST (`gh api .../issues?state=open`、`.pull_request == null`
  で Issue のみに絞る) で参照し、対応すべき Issue があれば優先度順に1件、作業ブランチ＋PR（本文に
  `Closes #<番号>`）で自律的に対応させる。無ければ「対応待ちの Issue はありません」と報告して終了。
- **狙い**: レビュー指摘やユーザー要望の Issue を取りこぼさず、タスクの区切りごとに自動で消化する。

## 補足 / Notes

- フックの実行はローカルの Kiro IDE 環境で行う。生成サンドボックスの制約（`env -u NODE_OPTIONS`
  前置が必須、`npm install` 不可）はプロンプト内にも明記している。
- フックの `enabled` を `false` にすると一時的に無効化できる。
