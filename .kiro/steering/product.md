---
inclusion: always
---

# プロダクト運営文書 / Product Steering

> Kiro の **運営文書（Steering documents, レッスン2）**。`inclusion: always` により、この
> ワークスペースでの全作業時に自動参照される。

## これは何か / What this is

デジモン風のモンスター育成 Web ゲーム。卵を孵化させ、お世話（餌やり・トレーニング・睡眠・清掃）と
バトルで育成し、成長段階ごとに姿が進化する。成長期以降は Amazon Bedrock（Claude）で会話できる。

## コアゲームプレイのルール（不変の仕様）/ Core rules

- **成長段階は 4 つ**: 幼年期(baby) → 成長期(rookie) → 成熟期(champion) → 完全体(ultimate)。
- **進化条件は「トレーニング回数 AND 経過時間」の両方**。片方だけでは進化しない。
- **進化は退化しない**（段階は単調非減少）。1 回の `evolveStage` は 1 段階だけ進める。
- **会話は段階依存**:
  - 幼年期 = 会話不可（Bedrock を呼ばず定型の鳴き声）
  - 成長期 = Claude **Haiku**
  - 成熟期 = Claude **Sonnet**
  - 完全体 = Claude **Opus**
- **ステータスは HP / ATK / DEF のみ**（+ maxHp）。常に `0<=hp<=maxHp`, `atk,def>=0`。
- **認証なし**: ブラウザ生成の `monsterId`(UUID) が DynamoDB パーティションキー。
- **時間経過**: 放置時間に応じて空腹・汚れが進み、満腹度が尽きると HP が減る。睡眠中は回復。
- **戦闘不能からの復帰**: HP0 になっても `reviveMonster` で最低限の HP を回復し遊び続けられる。

## やらないこと / Non-goals

- マルチプレイヤー、ログイン/アカウント、課金。
- 段階やステータスの追加（HP/ATK/DEF 以外のパラメータ）はスコープ外。
- ゲームルールをコード中に重複定義しない（`packages/shared` に一元化する）。

## 用語の統一 / Terminology

UI・ドキュメントとも日本語の段階名（幼年期 / 成長期 / 成熟期 / 完全体）を使う。
英名（baby/rookie/champion/ultimate）は `stageId` としてコード内でのみ使用する。
