import { useMemo, useState } from 'react';
import type { Dataset, Question } from '../types';
import { editId, type Edit, type SheetName } from '../lib/edits';

export type Change = Omit<Edit, 'before' | 'at'>;

interface Field {
  sheet: SheetName;
  key: Record<string, string | number>;
  column: string;
  /** 画面に出す項目名 */
  name: string;
  value: string;
  multiline?: boolean;
  /** 一覧に出す説明 */
  label: string;
}

interface Group {
  title: string;
  open: boolean;
  fields: Field[];
  /** 保存前のチェック（エラーがあれば文言を返す） */
  validate?: (get: (f: Field) => string) => string[];
}

function glossaryGroup(data: Dataset, no: number, open: boolean): Group | null {
  const e = data.glossary.find((g) => g.no === no);
  if (!e) return null;
  const label = `用語集 No.${no} ${e.term}`;
  const f = (column: string, value: string, multiline = true): Field => ({ sheet: '用語集', key: { No: no }, column, name: column, value, multiline, label });
  return {
    title: label,
    open,
    fields: [f('用語', e.term, false), f('意味（解説）', e.meaning), f('G検定の押さえどころ', e.keyPoint)],
  };
}

function clozeGroup(data: Dataset, id: string, open: boolean): Group | null {
  const c = data.cloze.find((x) => x.id === id);
  if (!c) return null;
  const label = `穴埋め ${id}（No.${c.no}）`;
  const fields: Field[] = [{ sheet: '穴埋め問題', key: { 問題ID: id }, column: '穴あき解説文', name: '穴あき解説文（【1】【2】…が空欄）', value: c.text, multiline: true, label }];
  for (const b of c.blanks)
    b.choices.forEach((v, k) =>
      fields.push({
        sheet: '穴埋め問題',
        key: { 問題ID: id, 空欄番号: b.n },
        column: `選択肢${k + 1}`,
        name: `【${b.n}】${k === 0 ? '正解（選択肢1）' : `誤答（選択肢${k + 1}）`}`,
        value: v,
        label,
      }),
    );
  return {
    title: label,
    open,
    fields,
    validate: (get) => {
      const errs: string[] = [];
      const text = get(fields[0]);
      const inText = [...new Set([...text.matchAll(/【(\d+)】/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
      const nums = c.blanks.map((b) => b.n);
      if (inText.join() !== nums.join()) errs.push(`穴あき解説文の空欄は【${nums.join('】【')}】のままにしてください（今は ${inText.length ? `【${inText.join('】【')}】` : 'なし'}）`);
      for (const b of c.blanks) {
        const vals = fields.filter((f) => f.key['空欄番号'] === b.n).map(get);
        if (new Set(vals).size !== vals.length) errs.push(`【${b.n}】の選択肢が重複しています`);
      }
      return errs;
    },
  };
}

function compareGroup(data: Dataset, themeId: string, aspect: string): Group | null {
  const t = data.compare.find((x) => x.id === themeId);
  const a = t?.aspects.find((x) => x.name === aspect);
  if (!t || !a) return null;
  const label = `比較 ${themeId}「${aspect}」`;
  const fields: Field[] = [
    { sheet: '比較テーマ', key: { 比較ID: themeId }, column: '違いの要点', name: '違いの要点', value: t.summary, multiline: true, label: `比較 ${themeId} ${t.theme}` },
    ...a.features.map<Field>((f) => ({
      sheet: '比較問題データ',
      key: { 比較ID: themeId, 観点: aspect, 用語: f.term },
      column: '特徴',
      name: `${f.term} の「${aspect}」`,
      value: f.text,
      multiline: true,
      label,
    })),
  ];
  return {
    title: `${label}（${t.theme}）`,
    open: true,
    fields,
    validate: (get) => {
      const vals = fields.slice(1).map(get);
      return new Set(vals).size !== vals.length ? ['同じ観点の中で特徴が重複しています'] : [];
    },
  };
}

function groupsFor(data: Dataset, q: Question): Group[] {
  const gs: (Group | null)[] = [];
  switch (q.kind) {
    case 'term':
    case 'reverse':
      if (q.source.type !== 'compare') {
        const [no, ...others] = q.source.choiceNos;
        gs.push(glossaryGroup(data, no, true));
        others.forEach((o) => gs.push(glossaryGroup(data, o, false)));
      }
      break;
    case 'compare':
      if (q.source.type === 'compare') {
        gs.push(compareGroup(data, q.source.themeId, q.source.aspect));
        q.explanationNos.forEach((no) => gs.push(glossaryGroup(data, no, false)));
      }
      break;
    case 'truefalse':
      gs.push(clozeGroup(data, q.clozeId, true));
      q.explanationNos.forEach((no) => gs.push(glossaryGroup(data, no, false)));
      break;
    case 'matching':
      for (const t of q.terms) {
        gs.push(glossaryGroup(data, t.no, false));
        const p = q.phrases.find((x) => x.owner === t.no);
        if (p) gs.push(clozeGroup(data, p.clozeId, false));
      }
      break;
  }
  return gs.filter((g): g is Group => g != null);
}

/** 回答画面に出す、この問題の元データの修正フォーム */
export function EditPanel({
  data,
  question,
  editedIds,
  onSave,
  onClose,
}: {
  data: Dataset;
  question: Question;
  /** 既に修正済みのセル */
  editedIds: Set<string>;
  onSave: (changes: Change[]) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => groupsFor(data, question), [data, question]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const get = (f: Field) => draft[editId(f)] ?? f.value;
  const changed = groups.flatMap((g) => g.fields).filter((f) => get(f) !== f.value);

  const save = () => {
    const all = groups.flatMap((g) => g.fields);
    const errs = [
      ...all.filter((f) => !get(f).trim()).map((f) => `「${f.name}」が空です（${f.label}）`),
      ...groups.flatMap((g) => (g.validate?.(get) ?? []).map((m) => `${g.title}: ${m}`)),
    ];
    setErrors(errs);
    if (errs.length) return;
    onSave(changed.map((f) => ({ sheet: f.sheet, key: f.key, column: f.column, after: get(f).trim(), label: f.label })));
    setDraft({});
  };

  return (
    <section className="edit-panel" aria-label="問題データの修正">
      <div className="edit-head">
        <strong>✎ 問題データの修正</strong>
        <button className="link" onClick={onClose}>
          閉じる
        </button>
      </div>
      <p className="hint">直した内容はこのブラウザに保存され、すぐ表示に反映されます。Excel への反映はトップの「修正の一覧」から書き出して行います。</p>
      {groups.map((g) => (
        <details key={g.title} className="edit-group" open={g.open}>
          <summary>{g.title}</summary>
          {g.fields.map((f) => {
            const id = editId(f);
            const v = get(f);
            const Input = f.multiline ? 'textarea' : 'input';
            return (
              <label key={id} className="edit-field">
                <span>
                  {f.name}
                  {editedIds.has(id) && <em className="edited">修正済み</em>}
                  {v !== f.value && <em className="dirty">未保存</em>}
                </span>
                <Input
                  value={v}
                  rows={f.multiline ? Math.min(12, Math.max(3, Math.ceil(v.length / 28))) : undefined}
                  onChange={(ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [id]: ev.target.value })}
                />
              </label>
            );
          })}
        </details>
      ))}
      {errors.length > 0 && (
        <ul className="edit-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="edit-actions">
        <button className="secondary" disabled={!changed.length} onClick={() => (setDraft({}), setErrors([]))}>
          元に戻す
        </button>
        <button className="primary" disabled={!changed.length} onClick={save}>
          保存して問題を作り直す（{changed.length}）
        </button>
      </div>
    </section>
  );
}
