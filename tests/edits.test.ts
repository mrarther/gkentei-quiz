import { describe, expect, it } from 'vitest';
import type { Dataset, TrueFalseQuestion } from '../src/types';
import glossary from '../src/data/glossary.json';
import cloze from '../src/data/cloze.json';
import compare from '../src/data/compare.json';
import { applyEdits, editStatus, upsertEdits, type Edit } from '../src/lib/edits';
import { rebuildQuestion } from '../src/lib/generators';
import { makeTermQuestion } from '../src/lib/generators/termQuiz';
import { makeTrueFalse, sentenceOf } from '../src/lib/generators/trueFalse';
import { makeCompareQuestion } from '../src/lib/generators/compare';
import { seeded } from '../src/lib/random';
import { diffParts } from '../src/lib/diff';

const base = { glossary, cloze, compare } as Dataset;
const g21 = base.glossary.find((g) => g.no === 21)!;

describe('修正の上書き', () => {
  it('用語集・穴埋め・比較の各項目に反映され、元のデータは変わらない', () => {
    const edits = upsertEdits([], base, [
      { sheet: '用語集', key: { No: 21 }, column: '意味（解説）', after: '新しい解説', label: '' },
      { sheet: '穴埋め問題', key: { 問題ID: 'Q001', 空欄番号: 1 }, column: '選択肢1', after: 'OpenAI社', label: '' },
      { sheet: '比較テーマ', key: { 比較ID: 'C001' }, column: '違いの要点', after: '要点', label: '' },
      { sheet: '比較問題データ', key: { 比較ID: 'C001', 観点: '予測の向き', 用語: 'CBOW' }, column: '特徴', after: '特徴', label: '' },
    ]);
    const d = applyEdits(base, edits);
    expect(d.glossary.find((g) => g.no === 21)!.meaning).toBe('新しい解説');
    const b = d.cloze.find((c) => c.id === 'Q001')!.blanks[0];
    expect(b.choices[0]).toBe('OpenAI社');
    expect(b.answer).toBe('OpenAI社'); // 正解は選択肢1に連動
    expect(d.compare[0].summary).toBe('要点');
    expect(d.compare[0].aspects[0].features.find((f) => f.term === 'CBOW')!.text).toBe('特徴');
    expect(g21.meaning).not.toBe('新しい解説');
  });

  it('同じセルの修正は1件にまとまり、before は最初の値を保つ。元に戻すと取り消し', () => {
    const c = { sheet: '用語集' as const, key: { No: 21 }, column: '意味（解説）', label: '' };
    let edits: Edit[] = upsertEdits([], base, [{ ...c, after: 'A' }]);
    edits = upsertEdits(edits, base, [{ ...c, after: 'B' }]);
    expect(edits).toHaveLength(1);
    expect(edits[0].before).toBe(g21.meaning);
    expect(edits[0].after).toBe('B');
    expect(upsertEdits(edits, base, [{ ...c, after: g21.meaning }])).toHaveLength(0);
  });

  it('状態: 未反映／反映済み／Excel 側が変わった', () => {
    const e: Edit = { sheet: '用語集', key: { No: 21 }, column: '意味（解説）', before: g21.meaning, after: 'X', label: '', at: 0 };
    expect(editStatus(base, e)).toBe('pending');
    expect(editStatus(applyEdits(base, [e]), e)).toBe('applied');
    expect(editStatus(base, { ...e, before: '別の値' })).toBe('conflict');
  });
});

describe('修正後の問題の作り直し', () => {
  it('用語当て: 同じ選択肢の用語で、修正した解説が出る', () => {
    const rng = seeded(1);
    const q = makeTermQuestion(base, g21, rng);
    const d = applyEdits(base, [{ sheet: '用語集', key: { No: 21 }, column: '意味（解説）', before: g21.meaning, after: '修正した解説', label: '', at: 0 }]);
    const r = rebuildQuestion(d, q, rng);
    expect(r.kind).toBe('term');
    if (r.kind !== 'term' || q.kind !== 'term') return;
    expect(r.prompt).toBe('修正した解説');
    expect([...r.choices].sort()).toEqual([...q.choices].sort());
  });
  it('正誤: 正しい文／誤りの文の別を保ち、修正した文で作る', () => {
    const rng = seeded(2);
    const item = base.cloze.find((c) => c.id === 'Q002')!;
    const q = makeTrueFalse(base, item, rng, false);
    const d = applyEdits(base, [{ sheet: '穴埋め問題', key: { 問題ID: 'Q002' }, column: '穴あき解説文', before: item.text, after: item.text + '（追記）', label: '', at: 0 }]);
    const r = rebuildQuestion(d, q, rng) as TrueFalseQuestion;
    expect(r.isTrue).toBe(false);
    expect(sentenceOf(r).endsWith('（追記）')).toBe(true);
  });
  it('比較: 同じ形式・同じ用語で作る', () => {
    const rng = seeded(3);
    const t = base.compare[0];
    const q = makeCompareQuestion(base, t, t.aspects[0].name, rng, { mode: 'term2feature', term: 'CBOW' });
    const r = rebuildQuestion(base, q, rng);
    expect(r.kind === 'compare' && r.source).toEqual(q.source);
  });
});

describe('diffParts', () => {
  it('変わった部分だけを取り出す', () => {
    expect(diffParts('分布が変化し続ける', '分布が変わり続ける')).toEqual({ prefix: '分布が変', removed: '化し', added: 'わり', suffix: '続ける' });
  });
});
