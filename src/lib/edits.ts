/**
 * 問題データの修正（編集モード）。
 *
 * 修正はこのブラウザの localStorage にだけ保存され、表示するデータに上書きして反映する。
 * 書き出した JSON を `npm run apply-edits -- edits.json` で Excel に書き戻す。
 * 1件の修正 = Excel の1セル（「穴あき解説文」だけは同じ問題IDの全行）。
 */
import type { Dataset } from '../types';

export type SheetName = '用語集' | '穴埋め問題' | '比較テーマ' | '比較問題データ';

export interface Edit {
  sheet: SheetName;
  /** 行を特定する列と値（例: { No: 21 }、{ 問題ID: 'Q001', 空欄番号: 2 }） */
  key: Record<string, string | number>;
  column: string;
  /** 最初に直す前の値（Excel 側が変わっていないかの確認に使う） */
  before: string;
  after: string;
  /** 一覧に出す説明（例: 「No.21 内部共変量シフト」） */
  label: string;
  at: number;
}

export interface EditsFile {
  format: 'gken-quiz-edits';
  version: 1;
  exportedAt: string;
  edits: Edit[];
}

const KEY = 'gken-quiz:edits:v1';
const MODE_KEY = 'gken-quiz:editmode';

export const editId = (e: Pick<Edit, 'sheet' | 'key' | 'column'>) =>
  `${e.sheet}|${Object.entries(e.key)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}|${e.column}`;

// ---- Excel のセル ↔ Dataset の項目 ----

type Access = { get: (d: Dataset) => string | undefined; set: (d: Dataset, v: string) => void };

const GLOSSARY_COLUMNS = { 用語: 'term', '意味（解説）': 'meaning', 'G検定の押さえどころ': 'keyPoint' } as const;

function access(e: Pick<Edit, 'sheet' | 'key' | 'column'>): Access | null {
  switch (e.sheet) {
    case '用語集': {
      const prop = GLOSSARY_COLUMNS[e.column as keyof typeof GLOSSARY_COLUMNS];
      if (!prop) return null;
      const find = (d: Dataset) => d.glossary.find((g) => g.no === Number(e.key.No));
      return { get: (d) => find(d)?.[prop], set: (d, v) => void (find(d) && (find(d)![prop] = v)) };
    }
    case '穴埋め問題': {
      const find = (d: Dataset) => d.cloze.find((c) => c.id === e.key['問題ID']);
      if (e.column === '穴あき解説文') return { get: (d) => find(d)?.text, set: (d, v) => void (find(d) && (find(d)!.text = v)) };
      const m = e.column.match(/^選択肢([1-4])$/);
      if (!m) return null;
      const k = Number(m[1]) - 1;
      const blank = (d: Dataset) => find(d)?.blanks.find((b) => b.n === Number(e.key['空欄番号']));
      return {
        get: (d) => blank(d)?.choices[k],
        set: (d, v) => {
          const b = blank(d);
          if (!b) return;
          b.choices[k] = v;
          if (k === 0) b.answer = v; // 正解は常に選択肢1
        },
      };
    }
    case '比較テーマ': {
      if (e.column !== '違いの要点') return null;
      const find = (d: Dataset) => d.compare.find((t) => t.id === e.key['比較ID']);
      return { get: (d) => find(d)?.summary, set: (d, v) => void (find(d) && (find(d)!.summary = v)) };
    }
    case '比較問題データ': {
      if (e.column !== '特徴') return null;
      const find = (d: Dataset) =>
        d.compare
          .find((t) => t.id === e.key['比較ID'])
          ?.aspects.find((a) => a.name === e.key['観点'])
          ?.features.find((f) => f.term === e.key['用語']);
      return { get: (d) => find(d)?.text, set: (d, v) => void (find(d) && (find(d)!.text = v)) };
    }
  }
}

/** 元データ（Excel から作ったもの）の現在の値 */
export const baseValue = (d: Dataset, e: Edit) => access(e)?.get(d);

/** 修正を上書きした新しい Dataset を返す（元の Dataset は変更しない） */
export function applyEdits(base: Dataset, edits: Edit[]): Dataset {
  if (!edits.length) return base;
  const d = structuredClone(base);
  for (const e of edits) access(e)?.set(d, e.after);
  return d;
}

/**
 * 修正の状態:
 *  - pending: Excel にまだ反映されていない
 *  - applied: Excel に反映済み（公開サイトのデータが修正後と同じ）
 *  - conflict: Excel 側が、直す前とも直した後とも違う内容に変わっている
 */
export function editStatus(base: Dataset, e: Edit): 'pending' | 'applied' | 'conflict' {
  const v = baseValue(base, e);
  if (v === e.after) return 'applied';
  if (v === e.before) return 'pending';
  return 'conflict';
}

// ---- 保存 ----

export function loadEdits(): Edit[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Edit[]) : [];
    return Array.isArray(list) ? list.filter((e) => access(e)) : [];
  } catch {
    return [];
  }
}

function saveEdits(edits: Edit[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(edits));
  } catch {
    /* 保存できなくても画面上の反映は続ける */
  }
}

/**
 * 修正を追加・更新する。同じセルの修正は1件にまとめ、before は最初の値を保つ。
 * 元の値に戻した場合は修正を取り消す。
 */
export function upsertEdits(current: Edit[], base: Dataset, changes: Omit<Edit, 'before' | 'at'>[]): Edit[] {
  const map = new Map(current.map((e) => [editId(e), e]));
  for (const c of changes) {
    const id = editId(c);
    const prev = map.get(id);
    const before = prev?.before ?? baseValue(base, { ...c, before: '', at: 0 }) ?? '';
    if (c.after === before) map.delete(id);
    else map.set(id, { ...c, before, at: Date.now() });
  }
  const next = [...map.values()];
  saveEdits(next);
  return next;
}

export function removeEdits(current: Edit[], ids: Set<string>): Edit[] {
  const next = current.filter((e) => !ids.has(editId(e)));
  saveEdits(next);
  return next;
}

export function toEditsFile(edits: Edit[]): EditsFile {
  return { format: 'gken-quiz-edits', version: 1, exportedAt: new Date().toISOString(), edits };
}

// ---- 編集モードのオン／オフ（URL に ?edit を付けて開くとオン） ----

export function initEditMode(): boolean {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('edit')) {
      const on = params.get('edit') !== '0';
      localStorage.setItem(MODE_KEY, on ? '1' : '0');
      params.delete('edit');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
    return localStorage.getItem(MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setEditMode(on: boolean) {
  try {
    localStorage.setItem(MODE_KEY, on ? '1' : '0');
  } catch {
    /* 無視 */
  }
}
