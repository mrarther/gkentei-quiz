import { useMemo, useState } from 'react';
import type { Dataset, QuizKind, Syllabus } from '../types';
import { KIND_LABEL } from '../labels';
import { clearWrong, load, saveSettings } from '../lib/storage';

export interface Settings {
  kind: QuizKind;
  count: number;
  fields: string[];
  syllabus: Syllabus[];
  weakOnly: boolean;
}

const KINDS: QuizKind[] = ['term', 'reverse', 'matching', 'truefalse', 'compare'];
const COUNTS = [10, 20, 50];
const SYLLABUS: { value: Syllabus; label: string }[] = [
  { value: '記載あり', label: '記載あり' },
  { value: '関連用語', label: '関連用語' },
  { value: '最新動向（シラバス外）', label: '最新動向' },
];

function initialSettings(fields: string[]): Settings {
  const def: Settings = { kind: 'term', count: 10, fields, syllabus: SYLLABUS.map((s) => s.value), weakOnly: false };
  const saved = load().settings as Partial<Settings> | undefined;
  if (!saved) return def;
  return {
    kind: KINDS.includes(saved.kind as QuizKind) ? (saved.kind as QuizKind) : def.kind,
    count: COUNTS.includes(saved.count as number) ? (saved.count as number) : def.count,
    fields: Array.isArray(saved.fields) ? saved.fields.filter((f) => fields.includes(f)) : def.fields,
    syllabus: Array.isArray(saved.syllabus) ? saved.syllabus.filter((s) => SYLLABUS.some((x) => x.value === s)) : def.syllabus,
    weakOnly: false,
  };
}

export function Home({ data, notice, onStart }: { data: Dataset; notice?: string; onStart: (s: Settings) => void }) {
  const fieldCounts = useMemo(() => {
    const m = new Map<string, number>();
    data.glossary.forEach((g) => m.set(g.field, (m.get(g.field) ?? 0) + 1));
    return [...m.entries()];
  }, [data]);
  const allFields = fieldCounts.map(([f]) => f);
  const [s, setS] = useState<Settings>(() => initialSettings(allFields));
  const [weakCount, setWeakCount] = useState(() => Object.keys(load().wrong).length);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const matchCount = data.glossary.filter((g) => s.fields.includes(g.field) && s.syllabus.includes(g.syllabus)).length;
  const canStart = s.fields.length > 0 && s.syllabus.length > 0;

  const start = (weakOnly: boolean) => {
    saveSettings({ ...s, weakOnly: false });
    onStart({ ...s, weakOnly });
  };

  return (
    <div className="stack">
      {notice && <p className="notice">{notice}</p>}

      <section className="card">
        <h2>クイズの種類</h2>
        <div className="options col">
          {KINDS.map((k) => (
            <button key={k} className={`opt ${s.kind === k ? 'on' : ''}`} aria-pressed={s.kind === k} onClick={() => setS({ ...s, kind: k })}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>出題数{s.kind === 'matching' && <small>（マッチングは1問＝5組）</small>}</h2>
        <div className="options row">
          {COUNTS.map((c) => (
            <button key={c} className={`opt ${s.count === c ? 'on' : ''}`} aria-pressed={s.count === c} onClick={() => setS({ ...s, count: c })}>
              {c}問
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>シラバス区分</h2>
        <div className="options row">
          {SYLLABUS.map(({ value, label }) => (
            <button
              key={value}
              className={`opt ${s.syllabus.includes(value) ? 'on' : ''}`}
              aria-pressed={s.syllabus.includes(value)}
              onClick={() => setS({ ...s, syllabus: toggle(s.syllabus, value) })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>分野</h2>
          <div className="mini-actions">
            <button onClick={() => setS({ ...s, fields: allFields })}>全選択</button>
            <button onClick={() => setS({ ...s, fields: [] })}>全解除</button>
          </div>
        </div>
        <div className="chips">
          {fieldCounts.map(([f, n]) => (
            <button key={f} className={`chip ${s.fields.includes(f) ? 'on' : ''}`} aria-pressed={s.fields.includes(f)} onClick={() => setS({ ...s, fields: toggle(s.fields, f) })}>
              {f}
              <span className="count">{n}</span>
            </button>
          ))}
        </div>
        <p className="hint">対象の用語: {matchCount} 語</p>
      </section>

      <div className="bottom-bar">
        <button className="primary" disabled={!canStart} onClick={() => start(false)}>
          スタート
        </button>
        <button className="secondary" disabled={!canStart || weakCount === 0} onClick={() => start(true)}>
          苦手な問題だけ復習（{weakCount}）
        </button>
      </div>
      {weakCount > 0 && (
        <p className="hint center">
          <button
            className="link"
            onClick={() => {
              if (confirm('苦手な問題の記録をすべて消しますか？')) {
                clearWrong();
                setWeakCount(0);
              }
            }}
          >
            苦手の記録を消す
          </button>
        </p>
      )}
    </div>
  );
}
