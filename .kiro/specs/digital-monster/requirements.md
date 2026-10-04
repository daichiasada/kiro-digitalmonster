# 要件定義 / Requirements — AIモンスター

> Kiro の **仕様主導型開発（Spec-driven development, レッスン1）** に沿って作成した要件書です。
> ユーザーストーリーは EARS 記法（Easy Approach to Requirements Syntax）を意識して記述しています。

## 1. 概要 / Introduction

デジモン風の育成ゲーム。ブラウザで卵を孵化させ、お世話とバトルを通じてモンスターを育成する。
成長段階（幼年期 → 成長期 → 成熟期 → 完全体）に応じて姿と会話能力が変化し、成長期以降は
Amazon Bedrock（Claude）でモンスターと会話できる。認証はなく、ブラウザ生成の `monsterId` を
キーに DynamoDB へ保存する。

実際の実装は `packages/shared`（純粋ロジック）、`packages/backend`（Lambda）、
`packages/frontend`（React+Vite）、`infra`（CDK）に対応する。

## 2. 用語 / Glossary

- **成長段階 (GrowthStage)**: `baby` 幼年期 / `rookie` 成長期 / `champion` 成熟期 / `ultimate` 完全体。
- **お世話 (care action)**: 餌やり(feed) / トレーニング(train) / 睡眠(sleep・wake) / 清掃(clean)。
- **ステータス (Stats)**: HP / 最大HP(maxHp) / 攻撃力(ATK) / 防御力(DEF)。

## 3. 要件 / Requirements

### 要件 1: 孵化と進化 (Hatch & Evolve)

**ユーザーストーリー:** プレイヤーとして、卵からモンスターを孵化させ、育てることで進化させたい。
育成の手応えを感じたいからだ。

#### 受け入れ基準 (EARS)

1. WHEN 新しいモンスターを作成する THEN システムは SHALL 成長段階 `baby`（幼年期）・
   初期ステータス `{hp:20, maxHp:20, atk:5, def:3}`・`trainingCount:0` で生成する。
2. WHEN モンスターがある段階の進化条件（トレーニング回数 **かつ** 経過時間の両方）を満たす
   THEN システムは SHALL 次の成長段階へ 1 段階だけ進化させる。
3. 進化条件は以下とする（`packages/shared/src/stages.ts` と一致）:
   - 幼年期→成長期: `trainingCount>=2` かつ 経過 `>=1分`
   - 成長期→成熟期: `trainingCount>=6` かつ 経過 `>=5分`
   - 成熟期→完全体: `trainingCount>=12` かつ 経過 `>=15分`
4. WHEN 進化が発生する THEN システムは SHALL 新しい段階のベースステータスへリベースし、
   その際 HP 比率を維持する。
5. IF モンスターがオフライン中に複数段階分の条件を満たした THEN システムは SHALL 1 回の
   更新で満たせるだけ連続して進化させる（各段で必ずステータスをリベースする）。
6. 進化は SHALL **退化しない**（段階インデックスは単調非減少）。

### 要件 2: お世話 (Care actions)

**ユーザーストーリー:** プレイヤーとして、餌やり・トレーニング・睡眠・清掃でモンスターの
世話をしたい。状態を良好に保ちたいからだ。

#### 受け入れ基準

1. WHEN 餌やりする THEN システムは SHALL 空腹度を下げ、HP を少し回復する。
2. WHEN トレーニングする THEN システムは SHALL `trainingCount` を +1 し ATK/DEF を上げ、
   空腹度を少し上げる。進化条件を満たせば進化する。
3. WHEN 睡眠させる THEN システムは SHALL 睡眠フラグを立て、以後の時間経過で HP を回復する。
4. WHEN 清掃する THEN システムは SHALL 汚れフラグを解除する。
5. 全てのお世話後も SHALL `0 <= hp <= maxHp` かつ `atk>=0, def>=0` を満たす。

### 要件 3: 時間経過 (Time passage)

**ユーザーストーリー:** プレイヤーとして、放置した時間に応じて状態が変化してほしい。
リアルタイム育成の手触りがほしいからだ。

#### 受け入れ基準

1. WHEN 前回更新からの経過時間がある THEN システムは SHALL 経過ティック数に応じて空腹度を
   上げ、3 ティック以上で汚れフラグを立てる。
2. IF 空腹度が最大 THEN システムは SHALL HP を徐々に減らす。
3. IF 睡眠中 THEN システムは SHALL HP を徐々に回復する。
4. 時間経過処理後に進化条件を満たせば SHALL 進化する（退化はしない）。

### 要件 4: バトル (Battle)

**ユーザーストーリー:** プレイヤーとして、敵モンスターと戦いたい。育成の成果を試したいからだ。

#### 受け入れ基準

1. WHEN バトルを実行する THEN システムは SHALL プレイヤー先攻のターン制で勝敗が決まるまで、
   または最大ターン数（100）まで戦う。
2. 同一の `seed` を与えた場合、バトル結果は SHALL 決定的（再現可能）である。
3. バトルは SHALL 必ず終了し、勝者は `player | enemy | draw` のいずれかである。
4. バトル後の `playerHpAfter` は SHALL `0 <= playerHpAfter <= maxHp` を満たす。
5. IF モンスターが HP0 で戦闘不能 THEN システムは SHALL `reviveMonster` で HP を 1 以上に
   回復させ、遊び続けられるようにする。

### 要件 5: 段階別の会話AI (Chat by stage)

**ユーザーストーリー:** プレイヤーとして、育てたモンスターと会話したい。愛着を深めたいからだ。

#### 受け入れ基準

1. IF 成長段階が幼年期 THEN システムは SHALL Bedrock を呼ばず定型の鳴き声を返す（会話不可）。
2. WHEN 成長期で会話する THEN システムは SHALL Claude **Haiku** を使う。
3. WHEN 成熟期で会話する THEN システムは SHALL Claude **Sonnet** を使う。
4. WHEN 完全体で会話する THEN システムは SHALL Claude **Opus** を使う。
5. IF サーバーにモンスター記録が存在する THEN システムは SHALL その段階を正とし、
   クライアントが上位段階を詐称してより大きいモデルを引き出せないようにする。
6. IF サーバー記録が無い THEN システムは SHALL クライアント送信の段階/名前にフォールバックし、
   未保存の新規モンスターでも初回会話できるようにする。

### 要件 6: セーブ / ロード (Save & Load)

**ユーザーストーリー:** プレイヤーとして、進捗を保存・再開したい。続きから遊びたいからだ。

#### 受け入れ基準

1. WHEN モンスターを保存する THEN システムは SHALL 深い構造検証（`validateMonster`）を通した
   うえで DynamoDB に保存する。
2. WHEN 保存済みモンスターを読み込む THEN システムは SHALL `monsterId` をキーに取得して返す。
3. 認証は無く、`monsterId`（ブラウザ生成 UUID）が DynamoDB のパーティションキーである。

### 要件 7: ワンコマンドデプロイ (One-command deploy)

**ユーザーストーリー:** 審査員/開発者として、1 コマンド相当でクラウドへデプロイしたい。

#### 受け入れ基準

1. WHEN `npm install && npm run build && (cd infra && npx cdk deploy)` を実行する
   THEN システムは SHALL S3+CloudFront・API Gateway+Lambda・DynamoDB・Bedrock IAM を構築する。
2. デプロイ時に生成した `config.json`（`apiBaseUrl`）を S3 に配置し、フロントが起動時に
   参照することで、2 回デプロイ無しに API と疎通する。
