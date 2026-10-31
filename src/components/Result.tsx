import type { AnswerRecord } from '../lib/storage';

const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

export function Result({
  title,
  records,
  onRetry,
  onReviewWeak,
  onHome,
}: {
  title: string;
  records: AnswerRecord[];
  onRetry: () => void;
  onReviewWeak: () => void;
  onHome: () => void;
}) {
  const total = records.length;
  const correct = records.filter((r) => r.correct).length;
  const byField = new Map<string, { c: number; t: number }>();
  for (const r of records) {
    const f = byField.get(r.field) ?? { c: 0, t: 0 };
    f.t++;
    if (r.correct) f.c++;
    byField.set(r.field, f);
  }
  const fields = [...byField.entries()].sort((a, b) => pct(a[1].c, a[1].t) - pct(b[1].c, b[1].t) || b[1].t - a[1].t);
  const wrong = records.filter((r) => !r.correct);

  return (
    <div className="stack">
      <section className="card center">
        <p className="muted">{title}</p>
        <p className="score">
          {pct(correct, total)}
          <small>%</small>
        </p>
        <p>
          {total} 問中 {correct} 問正解
        </p>
      </section>

      <section className="card">
        <h2>分野別の正答率</h2>
        <table className="fields">
          <tbody>
            {fields.map(([f, { c, t }]) => (
              <tr key={f}>
                <th>{f}</th>
                <td className="bar-cell">
                  <div className="bar" aria-hidden>
                    <div style={{ width: `${pct(c, t)}%` }} />
                  </div>
                </td>
                <td className="num">
                  {pct(c, t)}%<small>（{c}/{t}）</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {wrong.length > 0 && (
        <section className="card">
          <h2>間違えた問題（{wrong.length}）</h2>
          <ul className="wrong-list">
            {wrong.map((r, i) => (
              <li key={i}>{r.label}</li>
            ))}
          </ul>
          <p className="hint">間違えた問題は「苦手」として記録され、正解すると外れます。</p>
        </section>
      )}

      <div className="actions">
        <button className="primary" onClick={onRetry}>
          同じ条件でもう一度
        </button>
        {wrong.length > 0 && (
          <button className="secondary" onClick={onReviewWeak}>
            苦手な問題だけ復習
          </button>
        )}
        <button className="secondary" onClick={onHome}>
          トップへ
        </button>
      </div>
    </div>
  );
}
