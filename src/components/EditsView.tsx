import { useState } from 'react';
import type { Dataset } from '../types';
import { editId, editStatus, toEditsFile, type Edit } from '../lib/edits';
import { diffParts } from '../lib/diff';

const CONTEXT = 20;

/** 直した箇所だけを、前後の文脈付きで示す */
function Diff({ before, after }: { before: string; after: string }) {
  const d = diffParts(before, after);
  const head = (d.prefix.length > CONTEXT ? '…' : '') + d.prefix.slice(-CONTEXT);
  const tail = d.suffix.slice(0, CONTEXT) + (d.suffix.length > CONTEXT ? '…' : '');
  return (
    <p className="diff-inline">
      {head}
      {d.removed && <del>{d.removed}</del>}
      {d.added && <ins>{d.added}</ins>}
      {tail}
    </p>
  );
}

const STATUS_LABEL = {
  pending: { text: '未反映', cls: 'pending' },
  applied: { text: 'Excelに反映済み', cls: 'applied' },
  conflict: { text: 'Excelの内容が変わっています', cls: 'conflict' },
} as const;

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 修正の一覧・書き出し */
export function EditsView({
  base,
  edits,
  onRemove,
  onBack,
}: {
  /** Excel から作った元データ（修正を上書きする前） */
  base: Dataset;
  edits: Edit[];
  onRemove: (ids: Set<string>) => void;
  onBack: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const sorted = [...edits].sort((a, b) => b.at - a.at);
  const status = (e: Edit) => editStatus(base, e);
  const applied = edits.filter((e) => status(e) === 'applied');
  const exportable = edits.filter((e) => status(e) !== 'applied');
  const json = () => JSON.stringify(toEditsFile(exportable), null, 1);

  const download = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `edits-${stamp()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg(`${a.download} を保存しました。`);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
      setMsg('クリップボードにコピーしました。edits.json という名前のファイルに貼り付けて保存してください。');
    } catch {
      setMsg('コピーできませんでした。「ファイルに保存」を使ってください。');
    }
  };

  return (
    <div className="stack">
      <div className="progress-head">
        <button className="link" onClick={onBack}>
          ← トップ
        </button>
        <strong>修正の一覧（{edits.length}件）</strong>
        <span />
      </div>

      <section className="card">
        <h2>Excel への反映のしかた</h2>
        <ol className="steps">
          <li>下の「ファイルに保存」で修正を書き出す（スマホなら AirDrop などでパソコンへ送る）</li>
          <li>
            パソコンの作業フォルダで <code>npm run apply-edits -- edits-….json</code> を実行する（Excel に書き込み、チェックまで行います）
          </li>
          <li>Excel をコミットして push する。公開サイトが更新されると、ここで「Excelに反映済み」と表示されます</li>
        </ol>
        <div className="edit-actions">
          <button className="primary" disabled={!exportable.length} onClick={download}>
            ファイルに保存（{exportable.length}件）
          </button>
          <button className="secondary" disabled={!exportable.length} onClick={copy}>
            コピー
          </button>
        </div>
        {msg && <p className="notice">{msg}</p>}
      </section>

      {applied.length > 0 && (
        <button className="secondary" onClick={() => onRemove(new Set(applied.map(editId)))}>
          反映済みの {applied.length} 件を一覧から消す
        </button>
      )}

      {!edits.length && <p className="hint center">修正はまだありません。回答画面の「✎ 問題を修正」から直せます。</p>}

      {sorted.map((e) => {
        const s = STATUS_LABEL[status(e)];
        return (
          <section key={editId(e)} className="card edit-item">
            <div className="card-head">
              <div>
                <div className="entry-term">{e.label}</div>
                <div className="entry-meta">
                  {e.sheet}／{Object.values(e.key).join('・')}／{e.column}
                </div>
              </div>
              <span className={`status ${s.cls}`}>{s.text}</span>
            </div>
            <Diff before={e.before} after={e.after} />
            <details className="diff-full">
              <summary>全文を見る</summary>
              <div className="diff">
                <del>{e.before}</del>
                <ins>{e.after}</ins>
              </div>
            </details>
            <div className="right">
              <button
                className="link"
                onClick={() => {
                  if (confirm('この修正を取り消しますか？')) onRemove(new Set([editId(e)]));
                }}
              >
                この修正を取り消す
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
