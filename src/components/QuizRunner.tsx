import { useState } from 'react';
import type { Dataset, Question } from '../types';
import { recordAnswer, type AnswerRecord } from '../lib/storage';
import { ChoiceQuestion } from './ChoiceQuestion';
import { TrueFalseQuestion } from './TrueFalseQuestion';
import { MatchingQuestion } from './MatchingQuestion';
import { Feedback } from './Feedback';

type Answer = { kind: 'choice'; index: number } | { kind: 'tf'; value: boolean } | { kind: 'match'; pairs: Record<number, number> };

export function QuizRunner({
  data,
  title,
  questions,
  notice,
  onFinish,
  onQuit,
}: {
  data: Dataset;
  title: string;
  questions: Question[];
  notice?: string;
  onFinish: (records: AnswerRecord[]) => void;
  onQuit: () => void;
}) {
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const q = questions[i];

  const commit = (a: Answer, recs: AnswerRecord[]) => {
    recs.forEach(recordAnswer);
    setRecords((r) => [...r, ...recs]);
    setAnswer(a);
  };

  const next = () => {
    if (i + 1 >= questions.length) return onFinish(records);
    setI(i + 1);
    setAnswer(null);
    window.scrollTo(0, 0);
  };

  let correct: boolean | null = null;
  let body;
  switch (q.kind) {
    case 'term':
    case 'reverse':
    case 'compare': {
      const a = answer?.kind === 'choice' ? answer.index : null;
      if (a != null) correct = a === q.correctIndex;
      body = (
        <ChoiceQuestion
          q={q}
          answer={a}
          onAnswer={(index) => commit({ kind: 'choice', index }, [{ key: q.key, label: q.label, field: q.field, correct: index === q.correctIndex }])}
        />
      );
      break;
    }
    case 'truefalse': {
      const a = answer?.kind === 'tf' ? answer.value : null;
      if (a != null) correct = a === q.isTrue;
      body = (
        <TrueFalseQuestion
          q={q}
          answer={a}
          onAnswer={(value) => commit({ kind: 'tf', value }, [{ key: q.key, label: q.label, field: q.field, correct: value === q.isTrue }])}
        />
      );
      break;
    }
    case 'matching': {
      const a = answer?.kind === 'match' ? answer.pairs : null;
      if (a) correct = q.terms.every((t) => q.phrases[a[t.no]]?.owner === t.no);
      body = (
        <MatchingQuestion
          q={q}
          result={a}
          onSubmit={(pairs) =>
            commit(
              { kind: 'match', pairs },
              q.terms.map((t) => ({
                key: q.itemKeys[t.no].key,
                label: `用語集No.${t.no} ${t.name}`,
                field: q.itemKeys[t.no].field,
                correct: q.phrases[pairs[t.no]]?.owner === t.no,
              })),
            )
          }
        />
      );
      break;
    }
  }

  const matchScore = q.kind === 'matching' && answer?.kind === 'match' ? q.terms.filter((t) => q.phrases[answer.pairs[t.no]]?.owner === t.no).length : 0;

  return (
    <div className="stack">
      <div className="progress-head">
        <button className="link" onClick={() => confirm('クイズを中断してトップに戻りますか？') && onQuit()}>
          ← 中断
        </button>
        <span className="muted">{title}</span>
        <span className="qnum">
          {i + 1} / {questions.length}
        </span>
      </div>
      <div className="progress">
        <div style={{ width: `${((i + (answer ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      {notice && i === 0 && <p className="notice">{notice}</p>}

      {body}

      <p className="qid" title="問題の誤りを報告するときにお使いください">
        {q.label}
      </p>

      {answer && (
        <>
          <div className={`verdict ${correct ? 'ok' : 'ng'}`} role="status">
            {q.kind === 'matching' ? `${matchScore} / ${q.terms.length} 組 正解` : correct ? '○ 正解！' : '× 不正解'}
          </div>
          <Feedback data={data} nos={q.explanationNos} summary={q.kind === 'compare' ? q.summary : undefined} />
          <div className="bottom-bar">
            <button className="primary" onClick={next} autoFocus>
              {i + 1 >= questions.length ? '結果を見る' : '次の問題へ'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
