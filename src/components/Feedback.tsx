import type { Dataset } from '../types';

/** テキスト中の URL をリンクにする */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s）)」、]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** 回答後の解説（用語の意味・押さえどころ・参考資料） */
export function Feedback({ data, nos, summary }: { data: Dataset; nos: number[]; summary?: string }) {
  const entries = nos.map((no) => data.glossary.find((g) => g.no === no)).filter((e) => e != null);
  return (
    <div className="feedback">
      {summary && (
        <div className="summary">
          <h3>違いの要点</h3>
          <p>{summary}</p>
        </div>
      )}
      {entries.map((e) => (
        <details key={e.no} className="entry" open={entries.length === 1}>
          <summary>
            <span className="entry-term">{e.term}</span>
            <span className="entry-meta">
              {e.field}・{e.syllabus}
              {e.year && `・${e.year}`}・No.{e.no}
            </span>
          </summary>
          <dl>
            <dt>意味（解説）</dt>
            <dd>{e.meaning}</dd>
            <dt>G検定の押さえどころ</dt>
            <dd>{e.keyPoint}</dd>
            {(e.refTitle || e.refUrl) && (
              <>
                <dt>参考資料</dt>
                <dd>
                  {e.refTitle && <div>{e.refTitle}</div>}
                  {e.refLocation && <div className="muted">参照箇所: {e.refLocation}</div>}
                  {e.refUrl && (
                    <a href={e.refUrl} target="_blank" rel="noopener noreferrer">
                      {e.refUrl}
                    </a>
                  )}
                </dd>
              </>
            )}
            {e.supplement && (
              <>
                <dt>補足資料</dt>
                <dd>
                  <Linkify text={e.supplement} />
                </dd>
              </>
            )}
          </dl>
        </details>
      ))}
    </div>
  );
}
