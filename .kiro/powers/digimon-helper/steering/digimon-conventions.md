# digimon-helper 規約 / Conventions (Power steering)

> Kiro Power `digimon-helper` が提供する運営指針。このプロジェクトでゲーム要素を扱うときの
> 不変ルールを要約する（詳細は本体の `.kiro/steering/` を参照）。

- ゲームルールは `packages/shared` の純粋関数に一元化する。フロント/バックエンドは再実装せず
  import する。
- 成長段階は 4 つ（幼年期/成長期/成熟期/完全体）。進化は「トレーニング回数 AND 経過時間」で、
  退化しない。1 回の `evolveStage` は 1 段階だけ進める。
- 会話モデル対応: 幼年期=なし / 成長期=Haiku / 成熟期=Sonnet / 完全体=Opus。
- ステータスは HP/ATK/DEF（+maxHp）のみ。常に `0<=hp<=maxHp`, `atk,def>=0` を保つ。
- node ツールは必ず `env -u NODE_OPTIONS` を前置。新規依存はインストールしない。
- 変更後は必ず
  `env -u NODE_OPTIONS node --experimental-strip-types --test packages/shared/src/__tests__/*.ts`
  を実行する。
