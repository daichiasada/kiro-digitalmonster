/**
 * Train and Save controls.
 *
 * Train calls POST /train (which may evolve the monster) and reports back the
 * updated monster plus whether it evolved so the parent can refresh the view
 * and image. Save persists the current monster via POST /monster.
 */
import { useState } from 'react';
import type { Monster } from '@digital-monster/shared';

import { saveMonster, trainMonster, type TrainResult } from '../lib/api';

interface ControlsProps {
  monster: Monster;
  onMonsterChange: (monster: Monster) => void;
}

export function Controls({ monster, onMonsterChange }: ControlsProps) {
  const [busy, setBusy] = useState<'train' | 'save' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onTrain() {
    setErr(null);
    setStatus(null);
    setBusy('train');
    try {
      const result: TrainResult = await trainMonster();
      const { evolved, ...updated } = result;
      onMonsterChange(updated);
      setStatus(evolved ? '進化した！' : 'トレーニング完了！');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'トレーニングに失敗しました');
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    setErr(null);
    setStatus(null);
    setBusy('save');
    try {
      const saved = await saveMonster(monster);
      onMonsterChange(saved);
      setStatus('セーブしました');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'セーブに失敗しました');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="controls">
      <div className="controls-row">
        <button
          className="btn btn--train"
          type="button"
          onClick={() => void onTrain()}
          disabled={busy !== null}
        >
          {busy === 'train' ? 'トレーニング中…' : 'トレーニング'}
        </button>
        <button
          className="btn btn--save"
          type="button"
          onClick={() => void onSave()}
          disabled={busy !== null}
        >
          {busy === 'save' ? 'セーブ中…' : 'セーブ'}
        </button>
      </div>
      {status ? <p className="controls-status">{status}</p> : null}
      {err ? (
        <p className="controls-error" role="alert">
          {err}
        </p>
      ) : null}
    </section>
  );
}
