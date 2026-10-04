# MCP 設定 / Model Context Protocol settings

> Kiro の **モデルコンテキストプロトコル（MCP, レッスン6）**。外部ツール/知識源を MCP サーバー
> として接続し、エージェントから利用できるようにする。設定は `mcp.json`（ワークスペーススコープ）。

## 設定しているサーバー / Configured servers

### `aws-docs` — AWS ドキュメント検索

- **コマンド**: `uvx awslabs.aws-documentation-mcp-server@latest`
- **なぜ**: このプロジェクトは Amazon Bedrock（Claude のモデルID/リージョン可用性）・DynamoDB・
  API Gateway・Lambda・CloudFront/S3 を使う。AWS 公式ドキュメントを MCP 経由で検索・参照して、
  モデルアクセス有効化やリージョン差などの実装判断を正確に行うため。
- **autoApprove**: `read_documentation`, `search_documentation`, `recommend`（読み取り系のみ自動承認）。

### `aws-cdk` — CDK ガイダンス

- **コマンド**: `uvx awslabs.cdk-mcp-server@latest`
- **なぜ**: `infra/` の AWS CDK スタック（S3+CloudFront OAC、HTTP API v2、Bedrock IAM スコープ）を
  設計する際に、CDK のベストプラクティスや cdk-nag ルールの説明を参照するため。
- **autoApprove**: `CDKGeneralGuidance`, `ExplainCDKNagRule`。

## 使い方 / Usage

- `uvx`（`uv` 同梱）が必要。Kiro IDE が起動時にこれらの MCP サーバーを spawn し、ツールを
  エージェントへ公開する。
- 書き込み/破壊的なツールは `autoApprove` に含めず、都度承認する運用とする。
- サンドボックス（ネットワーク制限）では `uvx` によるサーバー取得ができないため、実際の接続は
  接続環境の Kiro IDE で行う。設定ファイル自体はレッスン6の実演として同梱している。
