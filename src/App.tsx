import { useMemo, useState } from 'react';
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
import { EditsView } from './components/EditsView';
import type { Change } from './components/EditPanel';
import { applyEdits, initEditMode, loadEdits, removeEdits, setEditMode, upsertEdits, type Edit } from './lib/edits';

type Screen =
  | { name: 'home'; notice?: string }
  | { name: 'quiz'; settings: Settings; questions: Question[]; notice?: string }
  | { name: 'result'; settings: Settings; records: AnswerRecord[] }
  | { name: 'edits' };


export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [editMode, setEditModeState] = useState(initEditMode);
  const [edits, setEdits] = useState<Edit[]>(loadEdits);
  // 表示に使うデータ = Excel から作ったデータ + このブラウザでの修正
  const data = useMemo(() => applyEdits(dataset, edits), [edits]);

  /** 修正を保存し、反映後のデータを返す（回答画面で問題を作り直すのに使う） */
  const saveEdits = (changes: Change[]) => {
    const next = upsertEdits(edits, dataset, changes);
    setEdits(next);
    return applyEdits(dataset, next);
  };
  const toggleEditMode = (on: boolean) => {
    setEditMode(on);
    setEditModeState(on);
  };

  const start = (settings: Settings) => {
    const weakKeys = settings.weakOnly ? new Set(Object.keys(load().wrong).flatMap((k) => k.split(','))) : undefined;
    const { questions, available } = generateQuiz(
      data,
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
        {screen.name === 'home' && (
          <Home
            data={data}
            notice={screen.notice}
            onStart={start}
            editMode={editMode}
            editCount={edits.length}
            onOpenEdits={() => setScreen({ name: 'edits' })}
            onEditModeChange={toggleEditMode}
          />
        )}
        {screen.name === 'edits' && (
          <EditsView base={dataset} edits={edits} onRemove={(ids) => setEdits(removeEdits(edits, ids))} onBack={() => setScreen({ name: 'home' })} />
        )}
        {screen.name === 'quiz' && (
          <QuizRunner
            key={screen.questions.map((q) => q.key).join('|')}
            data={data}
            editMode={editMode}
            edits={edits}
            onSaveEdits={saveEdits}
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
