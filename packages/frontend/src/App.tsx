import { useMonster } from "./state/useMonster.ts";
import { MonsterSprite } from "./assets/monsters/MonsterSprite.tsx";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { CarePanel } from "./components/CarePanel.tsx";
import { BattlePanel } from "./components/BattlePanel.tsx";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { EvolutionBanner } from "./components/EvolutionBanner.tsx";

/** Root game screen wiring the state hook to the UI panels. */
export function App() {
  const game = useMonster();

  return (
    <div className="app">
      <header className="app-header">
        <h1>デジタルモンスター育成</h1>
      </header>

      <EvolutionBanner stageId={game.justEvolvedTo} onDismiss={game.dismissEvolution} />

      {game.error !== null && <p className="app-error" role="alert">{game.error}</p>}

      {game.loading ? (
        <p className="loading">読み込み中…</p>
      ) : game.monster === null ? (
        <p className="loading">モンスターを準備できませんでした。</p>
      ) : (
        <main className="game-grid">
          <div className="stage-area">
            <div className={`sprite-wrap ${game.monster.isSleeping ? "sleeping" : ""}`}>
              <MonsterSprite stageId={game.monster.stageId} size={200} />
              {game.monster.isSleeping && <span className="zzz" aria-hidden="true">💤</span>}
              {game.monster.dirty && <span className="dirt" aria-hidden="true">💢</span>}
            </div>
            <StatsPanel monster={game.monster} />
          </div>

          <div className="controls-area">
            <CarePanel
              monster={game.monster}
              busy={game.busy}
              onFeed={game.feed}
              onTrain={game.train}
              onSleep={game.sleep}
              onClean={game.clean}
            />
            <BattlePanel
              busy={game.busy}
              log={game.battleLog}
              result={game.lastBattle}
              onBattle={game.battle}
            />
            <ChatPanel
              stageId={game.monster.stageId}
              log={game.chatLog}
              pending={game.chatPending}
              onSend={game.sendChat}
            />
          </div>
        </main>
      )}

      <footer className="app-footer">
        <small>進化条件: トレーニング回数 ＋ 経過時間 ／ セーブは自動です</small>
      </footer>
    </div>
  );
}

export default App;
