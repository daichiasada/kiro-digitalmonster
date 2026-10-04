# digimon-helper — Kiro Power

> Kiro の **パワー（Powers, レッスン5）** であり、**ボーナス「Kiro Power のパッケージ化」** の
> 実体でもある。ドキュメント・運営指針（steering）・再利用ワークフロー（skill）を 1 つの
> パッケージにまとめ、他プロジェクトや他メンバーへ共有できる形にしている。

## パッケージ構成 / Package layout

```
.kiro/powers/digimon-helper/
├── power.json                        # マニフェスト（name/version/description/keywords/steering/skills）
├── README.md                         # このファイル
├── steering/
│   └── digimon-conventions.md        # プロジェクト不変ルールの要約
└── skills/
    └── add-growth-stage.md           # 「新しい成長段階を追加する」端から端までの手順
```

## 何を提供するか / What it provides

- **steering**: ゲームルールの不変条件（4 段階、両閾値進化、退化なし、モデル対応、ステータス境界、
  `env -u NODE_OPTIONS` 前置、依存追加禁止）を要約し、作業時に参照できるようにする。
- **skill `add-growth-stage`**: 新しい成長段階を追加する際に触るべき横断箇所
  （types → stages → bedrock-models → backend → frontend(SVG) → infra(IAM) → tests → specs）を
  チェックリスト化。手戻りや同期漏れを防ぐ。

## 使い方 / Usage

Kiro の Powers インターフェースからこの Power を有効化すると、`power.json` の `steering` /
`skills` に列挙したファイルが読み込まれ、エージェントがプロジェクト固有の規約と手順を踏まえて
作業できるようになる。`mcpServers` は空（この Power は MCP サーバーを同梱しない）。

## マニフェスト形状 / Manifest shape

`power.json` は `name`, `version`, `description`, `keywords`, `author`, `license`,
`steering`（相対パス配列）, `skills`（相対パス配列）, `mcpServers`（任意）を持つ。
