/**
 * Root app: ensures a clientId exists, loads the monster on mount, and renders
 * the monster view, train/save controls, and the stage-gated chat panel.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Monster } from '@digital-monster/shared';

import { getMonster } from './lib/api';
import { getClientId } from './lib/clientId';
import { MonsterView } from './components/MonsterView';
import { Controls } from './components/Controls';
import { ChatPanel } from './components/ChatPanel';

export default function App() {
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // Ensure a client identity exists before any request.
      getClientId();
      const m = await getMonster();
      setMonster(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'モンスターの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>デジタルモンスター</h1>
      </header>

      {loading ? <p className="app-loading">読み込み中…</p> : null}
      {err ? (
        <div className="app-error" role="alert">
          <p>{err}</p>
          <button type="button" onClick={() => void load()}>
            再読み込み
          </button>
        </div>
      ) : null}

      {monster ? (
        <div className="app-grid">
          <MonsterView monster={monster} />
          <div className="app-side">
            <Controls monster={monster} onMonsterChange={setMonster} />
            <ChatPanel stage={monster.stage} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
