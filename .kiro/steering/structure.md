---
inclusion: always
---

# 構成運営文書 / Structure Steering

> **運営文書（レッスン2）**。ディレクトリ構成と「ロジックの置き場所」を定義する。

## ディレクトリ構成 / Layout

```
.
├── package.json              # npm workspaces ルート
├── tsconfig.base.json
├── .env.example
├── README.md
├── SUBMISSION.md             # Kiro University 審査員向け提出説明
├── packages/
│   ├── shared/               # 型・ゲームルール（純粋関数）+ node:test
│   │   └── src/
│   │       ├── types.ts
│   │       ├── stages.ts     # 成長段階表・進化判定
│   │       ├── game.ts       # お世話・時間経過・進化・revive・検証
│   │       ├── battle.ts     # 決定的バトルシミュレーション
│   │       ├── bedrock-models.ts
│   │       └── __tests__/     # *.test.ts（ユニット + property.test.ts）
│   ├── backend/              # Lambda ハンドラ
│   └── frontend/             # React + Vite UI、ステージ別 SVG
├── infra/                    # AWS CDK アプリ（クラウド構成 = cloud config）
│   ├── bin/app.ts
│   └── lib/digital-monster-stack.ts
├── .kiro/                    # Kiro アーティファクト
│   ├── specs/digital-monster/  # 仕様（requirements/design/tasks）
│   ├── steering/               # 運営文書（この3ファイル）
│   ├── hooks/                  # エージェントフック
│   ├── settings/mcp.json       # MCP サーバー設定
│   └── powers/digimon-helper/  # パッケージ化した Kiro Power
└── .agents/                  # マルチエージェント・オーケストレーション状態 + レビュー証跡
    ├── README.md
    └── tasks/task-digital-monster/
```

## ロジックの置き場所の原則 / Where logic lives

- **ゲームルールは全て `packages/shared`。** 段階表・進化条件・バトル・モデル対応はここだけに
  書き、フロント・バックエンド・CDK の IAM が同じ定義を参照する。重複定義は禁止。
- Lambda ハンドラ（`packages/backend`）は I/O（DynamoDB/Bedrock）に専念し、ルール計算は
  shared に委譲する。
- フロント（`packages/frontend`）の `useMonster` フックも shared の `applyTimePassage` 等を
  呼ぶだけにする。

## 新機能を追加するときの指針

成長段階やお世話アクションを足す手順は、パッケージ化した Power
`.kiro/powers/digimon-helper/`（skill: 「成長段階を追加する」）のチェックリストに従う。
触るべき横断箇所（shared / backend / frontend / infra / tests）が列挙されている。
