import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion, Dataset } from '../src/types';
import glossary from '../src/data/glossary.json';
import cloze from '../src/data/cloze.json';
import compare from '../src/data/compare.json';
import { seeded } from '../src/lib/random';
import { maskTerm, remainingAliases } from '../src/lib/mask';
import { generateQuiz } from '../src/lib/generators';
import { makeTermQuestion } from '../src/lib/generators/termQuiz';
import { makeReverseQuestion } from '../src/lib/generators/reverseQuiz';
import { buildMatchingSets, countValidAssignments, isUsablePhrase, stripWrapping } from '../src/lib/generators/matching';
import { makeTrueFalse, sentenceOf } from '../src/lib/generators/trueFalse';
import { makeCompareQuestion } from '../src/lib/generators/compare';
import { noFilter } from '../src/lib/filter';

const data = { glossary, cloze, compare } as Dataset;
const SEEDS = [1, 2, 3];

function expectValidChoices(q: ChoiceQuestion) {
  expect(new Set(q.choices).size).toBe(q.choices.length);
  expect(q.correctIndex).toBeGreaterThanOrEqual(0);
  expect(q.correctIndex).toBeLessThan(q.choices.length);
}

describe('用語当て（解説→用語）', () => {
  it.each(SEEDS)('全用語で選択肢が4つ・重複なし・正解を含み、用語名が伏せられている (seed %i)', (seed) => {
    const rng = seeded(seed);
    for (const e of data.glossary) {
      const q = makeTermQuestion(data, e, rng);
      expectValidChoices(q);
      expect(q.choices).toHaveLength(4);
      expect(q.choices[q.correctIndex]).toBe(e.term);
      expect(remainingAliases(q.prompt, e.term)).toEqual([]);
    }
  });
  it('誤答は同じ分野から選ぶ（3語以上ある分野）', () => {
    const rng = seeded(7);
    const fieldSize = new Map<string, number>();
    data.glossary.forEach((g) => fieldSize.set(g.field, (fieldSize.get(g.field) ?? 0) + 1));
    for (const e of data.glossary.filter((g) => fieldSize.get(g.field)! >= 4)) {
      const q = makeTermQuestion(data, e, rng);
      for (const c of q.choices) expect(data.glossary.find((g) => g.term === c)!.field).toBe(e.field);
    }
  });
  it('正解の位置がばらける', () => {
    const rng = seeded(9);
    const pos = new Set(data.glossary.slice(0, 40).map((e) => makeTermQuestion(data, e, rng).correctIndex));
    expect(pos.size).toBe(4);
  });
});

describe('逆引き（用語→解説）', () => {
  it.each(SEEDS)('すべての選択肢でそれぞれの用語名が伏せられている (seed %i)', (seed) => {
    const rng = seeded(seed);
    for (const e of data.glossary) {
      const q = makeReverseQuestion(data, e, rng);
      expectValidChoices(q);
      expect(q.choices).toHaveLength(4);
      for (const c of q.choices) {
        const owner = data.glossary.find((g) => maskEq(g, c));
        expect(owner, c).toBeTruthy();
        expect(remainingAliases(c, owner!.term)).toEqual([]);
      }
    }
  });
});

// 選択肢の文がどの用語の解説から作られたか
const maskEq = (g: (typeof data.glossary)[number], c: string) => maskTerm(g.meaning, g.term) === c;

describe('マッチング', () => {
  it.each(SEEDS)('正解の割り当てが1通りに決まる (seed %i)', (seed) => {
    const sets = buildMatchingSets(data, data.glossary, Infinity, seeded(seed));
    expect(sets.length).toBeGreaterThan(30);
    for (const q of sets) {
      expect(q.terms).toHaveLength(5);
      expect(new Set(q.phrases.map((p) => p.text)).size).toBe(5);
      expect(new Set(q.terms.map((t) => t.no)).size).toBe(5);
      expect(countValidAssignments(q, data)).toBe(1);
      for (const p of q.phrases) expect(isUsablePhrase(p.text)).toBe(true);
    }
  });
  it('数字・社名・短すぎる語句は使わない', () => {
    for (const s of ['2つ', '1回だけ', 'Google', 'OpenAI', 'Facebook（現Meta）', '5,400億（540B）', 'トロント大学', '2017年'])
      expect(isUsablePhrase(s), s).toBe(false);
    for (const s of ['対照学習', 'ゼロショット画像分類', 'U-Net', 'TD誤差']) expect(isUsablePhrase(s), s).toBe(true);
  });
  it('語句全体を囲む括弧は外す', () => {
    expect(stripWrapping('「Part Affinity Fields（PAF）」')).toBe('Part Affinity Fields（PAF）');
    expect(stripWrapping('（有用性）')).toBe('有用性');
    expect(isUsablePhrase('（有用性）')).toBe(false);
    expect(stripWrapping('（A）と（B）')).toBe('（A）と（B）');
  });
});

describe('正誤（○×）', () => {
  it('正しい文は全空欄が正解、誤りの文は1か所だけ誤答', () => {
    const rng = seeded(4);
    for (const c of data.cloze) {
      const t = makeTrueFalse(data, c, rng, true);
      const f = makeTrueFalse(data, c, rng, false);
      expect(sentenceOf(t)).not.toMatch(/【\d+】/);
      expect(t.segments.every((s) => !s.fill || s.text === s.fill.correct)).toBe(true);
      const swapped = f.segments.filter((s) => s.fill?.swapped);
      expect(new Set(swapped.map((s) => s.fill!.n)).size).toBe(1);
      for (const s of swapped) expect(s.text).not.toBe(s.fill!.correct);
      expect(sentenceOf(f)).not.toBe(sentenceOf(t));
    }
  });
  it('正しい文と誤りの文がおよそ半々', () => {
    const rng = seeded(5);
    const trues = Array.from({ length: 1000 }, (_, i) => makeTrueFalse(data, data.cloze[i % data.cloze.length], rng).isTrue).filter(Boolean).length;
    expect(trues).toBeGreaterThan(420);
    expect(trues).toBeLessThan(580);
  });
});

describe('比較', () => {
  it('選択肢はテーマの用語数・重複なし・正解を含む', () => {
    const rng = seeded(6);
    for (const t of data.compare)
      for (const a of t.aspects)
        for (const f of a.features)
          for (const mode of ['feature2term', 'term2feature'] as const) {
            const q = makeCompareQuestion(data, t, a.name, rng, { mode, term: f.term });
            expectValidChoices(q);
            expect(q.choices).toHaveLength(t.terms.length);
            if (mode === 'feature2term') expect(q.choices[q.correctIndex]).toBe(f.term);
            expect(q.summary).toBe(t.summary);
          }
  });
});

describe('generateQuiz', () => {
  it.each(['term', 'reverse', 'matching', 'truefalse', 'compare'] as const)('%s: 出題数どおり作れる', (kind) => {
    const r = generateQuiz(data, kind, 20, noFilter, seeded(8));
    expect(r.questions).toHaveLength(20);
  });
  it('分野で絞り込める', () => {
    const r = generateQuiz(data, 'term', 50, { fields: ['強化学習'], syllabus: [] }, seeded(8));
    expect(r.questions.length).toBe(4);
    expect(r.questions.every((q) => q.field === '強化学習')).toBe(true);
  });
  it('苦手のみ', () => {
    const r = generateQuiz(data, 'truefalse', 10, { ...noFilter, weakKeys: new Set(['cloze:Q001', 'cloze:Q005']) }, seeded(8));
    expect(r.questions.map((q) => q.key).sort()).toEqual(['cloze:Q001', 'cloze:Q005']);
  });
});
