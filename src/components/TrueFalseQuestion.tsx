import type { TrueFalseQuestion as Q } from '../types';

export function TrueFalseQuestion({ q, answer, onAnswer }: { q: Q; answer: boolean | null; onAnswer: (v: boolean) => void }) {
  const done = answer != null;
  return (
    <div className="stack">
      <div className="prompt">
        <p className="prompt-lead">次の文は正しい？</p>
        <p className="prompt-body">
          {q.segments.map((s, i) => {
            if (!s.fill || !done) return <span key={i}>{s.text}</span>;
            if (s.fill.swapped)
              return (
                <span key={i} className="swapped">
                  <del>{s.text}</del>
                  <ins>{s.fill.correct}</ins>
                </span>
              );
            return (
              <mark key={i} className="filled">
                {s.text}
              </mark>
            );
          })}
        </p>
      </div>
      <div className="tf">
        {[true, false].map((v) => {
          const state = !done ? '' : v === q.isTrue ? 'correct' : v === answer ? 'wrong' : 'dim';
          return (
            <button key={String(v)} className={`choice tf-btn ${state}`} disabled={done} onClick={() => onAnswer(v)} aria-label={v ? '正しい' : '誤り'}>
              {v ? '○' : '×'}
              <small>{v ? '正しい' : '誤り'}</small>
            </button>
          );
        })}
      </div>
      {done && (
        <p className="explain">
          {q.isTrue ? 'この文は正しい文です。' : '誤りの文です。取り消し線の語句を、緑の語句に直すと正しい文になります。'}
        </p>
      )}
    </div>
  );
}
