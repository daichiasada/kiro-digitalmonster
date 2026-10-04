# マルチエージェント開発ワークフロー / Agents

> Kiro の **エージェント（Agents, レッスン7）**。このプロジェクトは、役割の異なる複数の
> エージェントが協調してビルドされた。本書はその構成と、`.agents/` 配下に残る実際の証跡を説明する。
>
> 注: ユーザー提供のレッスン一覧では項目7が「通関業者」と表記されているが、これは "Agents" の
> 機械翻訳由来の誤りと考えられる。正式名称は公開時に
> https://kiro.dev/2026/university/ で確認すること。

## エージェント構成 / The agent loop

| 役割 | 責務 | 成果物の置き場所 |
|---|---|---|
| **アーキテクト (architect)** | 要件を解釈し、機能を `FEAT-00x` に分解して計画・コンテキストを作成 | `.agents/tasks/task-digital-monster/task.json`, `context.json`, `features/FEAT-00x.json` |
| **コーダー (coder)** | 機能を 1 つずつ実装し、ビルド/テストで検証してからコミット | `packages/*`, `infra/*`, `.kiro/*` |
| **セマンティックレビュアー (reviewer)** | 作業ツリー全体をレビューし、問題を指摘して検証結果を記録 | `.agents/tasks/task-digital-monster/*-review.md` |

アーキテクトが計画 → コーダーが 1 機能ずつ実装 → レビュアーが指摘 → コーダーが修正、という
ループを回した。レビューは最低 3 回実施し、各回の判定（NEEDS_CHANGES / APPROVED）を文書化している。

## 実際の証跡 / Evidence in this repo

- **タスク状態**: `.agents/tasks/task-digital-monster/`
  - `task.json`（全体計画）, `context.json`（プロジェクトコンテキスト）
  - `features/FEAT-001.json`..`FEAT-005.json`（機能ごとの手順・受け入れ基準・ステータス）
- **レビュー証跡（v1 → v2 → v3）**:
  - `.agents/tasks/task-digital-monster/2026-10-04-151615-review.md` — **v1**: 二重進化のステータス
    未リベース等 7 件を指摘し `NEEDS_CHANGES`。
  - `.agents/tasks/task-digital-monster/2026-10-04-152533-review.md` — **v2**: 7 件の修正を実コードで
    検証し `APPROVED`（1 件の軽微な注意点を残す）。
  - `.agents/tasks/task-digital-monster/2026-10-04-152905-review.md` — **v3**: 複数段階オフライン
    キャッチアップ（`applyAllEvolutions`）の修正を最終検証し `APPROVED`。

## Kiro のエージェント機能との対応 / Mapping to Kiro

- 各エージェントは特定の役割プロンプトで動く専門エージェントとして運用した（計画担当・実装担当・
  レビュー担当）。
- 実装は「1 機能＝1 まとまり」で進め、各機能ごとにビルド/テストで検証してから次へ進む
  （`FEAT-00x.json` の `status` と `findings` が進行を記録）。
- レビュアーはコードを鵜呑みにせず、指摘した各修正を実コードに当てて検証した（`*-review.md` に
  "verified against the actual code, not taken on faith" と記録）。

この一連の計画→実装→レビューの反復と、その状態・判定が `.agents/` にファイルとして残っている
ことが、エージェント駆動開発（レッスン7）の実演である。
