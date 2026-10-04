# スキル: 新しい成長段階を追加する / Add a growth stage

> `digimon-helper` Power のスキル。新しい成長段階（例: 完全体の先の「究極体」）を
> **端から端まで** 追加するためのチェックリスト。横断的に触る箇所を漏れなく列挙する。

## 前提の確認

- 既存段階: `baby` 幼年期 → `rookie` 成長期 → `champion` 成熟期 → `ultimate` 完全体。
- 進化条件は「トレーニング回数 AND 経過時間」の両方。退化しない。
- 新段階は会話可能なら Bedrock モデル tier（haiku/sonnet/opus のいずれか、または新 tier）を割り当てる。

## 手順 / Steps

1. **型 (`packages/shared/src/types.ts`)**
   - `GrowthStage` ユニオンに新 `stageId` を追加。
   - 新しいモデル tier を使うなら `BedrockModelKey` にも追加。

2. **段階表 (`packages/shared/src/stages.ts`)**
   - `STAGES` 配列に新しい `StageConfig` を**正しい順序で**追加（`labelJa`, `canChat`,
     `bedrockModelKey`, `baseStats`, `evolveRequirement`）。
   - 直前の段階の `evolveRequirement` を見直し（最終段階だった段階は `null` → 新段階への条件へ）。
   - 新段階が最終なら `evolveRequirement: null`。

3. **モデルマッピング (`packages/shared/src/bedrock-models.ts`)**
   - 新 tier を足した場合は `BEDROCK_MODEL_IDS` / `BEDROCK_MODEL_ENV_VARS` にデフォルトIDと
     上書き用環境変数名を追加。

4. **バックエンド (`packages/backend`)**
   - chat ハンドラは `modelKeyForStage` / `chooseChatContext` 経由で解決するため、通常は
     段階表の変更だけで追従する。新 tier を足した場合のみ IAM スコープ（下記 6）を確認。

5. **フロント (`packages/frontend`)**
   - 新段階の **SVG スプライト** を追加し、ステージ→スプライトの対応表を更新。
   - 段階表示ラベル（日本語）が UI に反映されるか確認。

6. **インフラ (`infra/lib/digital-monster-stack.ts`)**
   - 新しい Bedrock モデルを使う場合、chat Lambda の `InvokeModel` IAM リソースに新モデルの
     ARN/ID が含まれるか確認（モデルIDの環境変数も渡す）。

7. **テスト (`packages/shared/src/__tests__/`)**
   - `stages.test.ts` / `game.test.ts` に新段階への進化とステータスリベースのケースを追加。
   - プロパティベーステスト（`game.property.test.ts`）は `STAGES` を参照して自動で新段階を
     ジェネレータに含むので、追加の調整は基本不要（必要なら生成範囲を確認）。

8. **仕様 (`.kiro/specs/digital-monster/`)**
   - `requirements.md` の進化条件表、`design.md` の段階表、`tasks.md` を更新。

## 検証 / Verify

```bash
env -u NODE_OPTIONS node --experimental-strip-types --test packages/shared/src/__tests__/*.ts
```

全テストが green であること。接続環境では `npm run build` と `cdk synth` も通すこと。
