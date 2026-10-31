import type { ChoiceQuestion as Q } from '../types';

export function ChoiceQuestion({ q, answer, onAnswer }: { q: Q; answer: number | null; onAnswer: (i: number) => void }) {
  const done = answer != null;
  return (
    <div className="stack">
      <div className={`prompt ${q.promptIsTerm ? 'prompt-term' : ''}`}>
        {q.promptIsTerm && <p className="prompt-lead">この用語の説明として正しいものは？</p>}
        {q.kind === 'term' && <p className="prompt-lead">次の説明にあてはまる用語は？</p>}
        <p className="prompt-body">{q.prompt}</p>
      </div>
      <div className="choices">
        {q.choices.map((c, i) => {
          const state = !done ? '' : i === q.correctIndex ? 'correct' : i === answer ? 'wrong' : 'dim';
          return (
            <button key={i} className={`choice ${q.promptIsTerm ? 'long' : ''} ${state}`} disabled={done} onClick={() => onAnswer(i)}>
              <span className="mark">{done && i === q.correctIndex ? '○' : done && i === answer ? '×' : String.fromCharCode(65 + i)}</span>
              <span>{c}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
