import { useState } from 'react';
import { dataset } from './data';
import type { Question } from './types';
import type { AnswerRecord } from './lib/storage';
import { Home, type Settings } from './components/Home';
import { QuizRunner } from './components/QuizRunner';
import { Result } from './components/Result';
import { generateQuiz } from './lib/generators';
import { load, recordSession } from './lib/storage';
import { defaultRng } from './lib/random';
import { KIND_LABEL } from './labels';

type Screen =
  | { name: 'home'; notice?: string }
  | { name: 'quiz'; settings: Settings; questions: Question[]; notice?: string }
  | { name: 'result'; settings: Settings; records: AnswerRecord[] };


export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  const start = (settings: Settings) => {
    const weakKeys = settings.weakOnly ? new Set(Object.keys(load().wrong).flatMap((k) => k.split(','))) : undefined;
    const { questions, available } = generateQuiz(
      dataset,
      settings.kind,
      settings.count,
      { fields: settings.fields, syllabus: settings.syllabus, weakKeys },
      defaultRng,
    );
    if (!questions.length) {
      setScreen({
        name: 'home',
        notice: settings.weakOnly ? 'この条件で復習する苦手な問題はありません。' : 'この条件に合う問題がありません。条件を広げてください。',
      });
      return;
    }
    const unit = settings.kind === 'matching' ? '組' : '問';
    const notice =
      questions.length < settings.count
        ? `条件に合う問題が少ないため、${questions.length}${unit}を出題します（対象 ${available}${settings.kind === 'matching' ? '組分' : '件'}）。`
        : undefined;
    setScreen({ name: 'quiz', settings, questions, notice });
    window.scrollTo(0, 0);
  };

  const finish = (settings: Settings, records: AnswerRecord[]) => {
    recordSession({ at: Date.now(), kind: settings.kind, total: records.length, correct: records.filter((r) => r.correct).length });
    setScreen({ name: 'result', settings, records });
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <header className="appbar">
        <button className="brand" onClick={() => setScreen({ name: 'home' })}>
          G検定 用語クイズ
        </button>
      </header>
      <main>
        {screen.name === 'home' && <Home data={dataset} notice={screen.notice} onStart={start} />}
        {screen.name === 'quiz' && (
          <QuizRunner
            key={screen.questions.map((q) => q.key).join('|')}
            data={dataset}
            title={KIND_LABEL[screen.settings.kind]}
            questions={screen.questions}
            notice={screen.notice}
            onFinish={(records) => finish(screen.settings, records)}
            onQuit={() => setScreen({ name: 'home' })}
          />
        )}
        {screen.name === 'result' && (
          <Result
            title={KIND_LABEL[screen.settings.kind]}
            records={screen.records}
            onRetry={() => start(screen.settings)}
            onReviewWeak={() => start({ ...screen.settings, weakOnly: true })}
            onHome={() => setScreen({ name: 'home' })}
          />
        )}
      </main>
    </div>
  );
}
