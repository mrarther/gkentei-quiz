import { useState } from 'react';
import type { MatchingQuestion as Q } from '../types';

/**
 * タップで1組ずつ作る方式。用語をタップ → 説明をタップで組になる。
 * 組になった用語か説明をもう一度タップすると解除。5組そろったら「採点」。
 */
export function MatchingQuestion({
  q,
  result,
  onSubmit,
}: {
  q: Q;
  /** 採点後: 用語No → 選んだ説明の index */
  result: Record<number, number> | null;
  onSubmit: (pairs: Record<number, number>) => void;
}) {
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const done = result != null;
  const shown = result ?? pairs;
  const pairIndex = (no: number) => q.terms.findIndex((t) => t.no === no);
  const ownerOfPhrase = (pi: number) => Number(Object.keys(shown).find((k) => shown[Number(k)] === pi) ?? NaN);

  const tapTerm = (no: number) => {
    if (done) return;
    if (pairs[no] != null) {
      const { [no]: _, ...rest } = pairs;
      setPairs(rest);
      setSelected(no);
      return;
    }
    // 組を作ると次の用語が自動で選ばれるので、選択中の用語をタップしても解除しない
    setSelected(no);
  };
  const tapPhrase = (pi: number) => {
    if (done) return;
    const owner = ownerOfPhrase(pi);
    if (!Number.isNaN(owner)) {
      const { [owner]: _, ...rest } = pairs;
      setPairs(rest);
      return;
    }
    if (selected == null) return;
    setPairs({ ...pairs, [selected]: pi });
    const next = q.terms.find((t) => t.no !== selected && pairs[t.no] == null);
    setSelected(next ? next.no : null);
  };

  return (
    <div className="stack">
      <p className="prompt-lead">用語をタップしてから、対応する語句をタップしてください（タップし直すと解除）。</p>
      <div className="match-col">
        {q.terms.map((t, i) => {
          const pi = shown[t.no];
          const ok = done && q.phrases[pi]?.owner === t.no;
          return (
            <button
              key={t.no}
              className={`match-item term ${selected === t.no && !done ? 'selected' : ''} ${pi != null ? `paired p${i}` : ''} ${done ? (ok ? 'correct' : 'wrong') : ''}`}
              onClick={() => tapTerm(t.no)}
              disabled={done}
            >
              <span className="badge">{i + 1}</span>
              <span>{t.name}</span>
              {done && !ok && <span className="answer-note">正解: {q.phrases.find((p) => p.owner === t.no)!.text}</span>}
            </button>
          );
        })}
      </div>
      <div className="match-col phrases">
        {q.phrases.map((p, pi) => {
          const owner = ownerOfPhrase(pi);
          const idx = Number.isNaN(owner) ? -1 : pairIndex(owner);
          return (
            <button
              key={pi}
              className={`match-item phrase ${idx >= 0 ? `paired p${idx}` : ''} ${selected != null && idx < 0 && !done ? 'ready' : ''}`}
              onClick={() => tapPhrase(pi)}
              disabled={done}
            >
              <span className="badge">{idx >= 0 ? idx + 1 : '・'}</span>
              <span>{p.text}</span>
              {done && <span className="id-note">{p.clozeId}</span>}
            </button>
          );
        })}
      </div>
      {!done && (
        <button className="primary" disabled={Object.keys(pairs).length < q.terms.length} onClick={() => onSubmit(pairs)}>
          採点する（{Object.keys(pairs).length}/{q.terms.length}組）
        </button>
      )}
    </div>
  );
}
