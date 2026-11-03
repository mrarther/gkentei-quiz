import type { Dataset, Question, QuizKind } from '../../types';
import { entryPasses, glossaryIndex, keys, type QuizFilter } from '../filter';
import { sample, shuffle, type Rng } from '../random';
import { makeCompareQuestion } from './compare';
import { buildMatchingSets, MATCH_SIZE, stripWrapping } from './matching';
import { makeReverseQuestion } from './reverseQuiz';
import { makeTermQuestion } from './termQuiz';
import { makeTrueFalse } from './trueFalse';

export { makeTermQuestion, makeReverseQuestion, makeTrueFalse, makeCompareQuestion, buildMatchingSets };

export interface GenerateResult {
  questions: Question[];
  /** 条件に合う出題の単位の数（マッチングは作れる組の上限の目安） */
  available: number;
}

export function generateQuiz(data: Dataset, kind: QuizKind, count: number, filter: QuizFilter, rng: Rng): GenerateResult {
  const idx = glossaryIndex(data);
  const weak = filter.weakKeys;
  const termPool = data.glossary.filter((e) => entryPasses(e, filter) && (!weak || weak.has(keys.term(e.no))));

  switch (kind) {
    case 'term':
    case 'reverse': {
      const make = kind === 'term' ? makeTermQuestion : makeReverseQuestion;
      return { questions: sample(termPool, count, rng).map((e) => make(data, e, rng)), available: termPool.length };
    }
    case 'matching': {
      const sets = buildMatchingSets(data, termPool, count, rng);
      return { questions: sets, available: Math.floor(termPool.length / MATCH_SIZE) };
    }
    case 'truefalse': {
      const pool = data.cloze.filter((c) => entryPasses(idx.get(c.no), filter) && (!weak || weak.has(keys.cloze(c.id))));
      return { questions: sample(pool, count, rng).map((c) => makeTrueFalse(data, c, rng)), available: pool.length };
    }
    case 'compare': {
      const units = data.compare
        .filter((t) => t.terms.some((x) => entryPasses(idx.get(x.no), filter)))
        .flatMap((t) => t.aspects.map((a) => ({ t, a: a.name })))
        .filter((u) => !weak || weak.has(keys.compare(u.t.id, u.a)));
      // 同じテーマが続きすぎないよう、まずテーマごとに1観点ずつ選んでから残りを足す
      const shuffled = shuffle(units, rng);
      const firstPerTheme = new Map<string, (typeof units)[number]>();
      for (const u of shuffled) if (!firstPerTheme.has(u.t.id)) firstPerTheme.set(u.t.id, u);
      const ordered = [...shuffle([...firstPerTheme.values()], rng), ...shuffled.filter((u) => firstPerTheme.get(u.t.id) !== u)];
      const questions = ordered.slice(0, count).map((u) => makeCompareQuestion(data, u.t, u.a, rng));
      return { questions, available: units.length };
    }
  }
}


/**
 * 修正したデータで、同じ元データから問題を作り直す（編集モード用）。
 * 用語当て・逆引きは同じ選択肢の用語、正誤は正しい文／誤りの文の別、比較は同じ形式を保つ。
 */
export function rebuildQuestion(data: Dataset, q: Question, rng: Rng): Question {
  const idx = glossaryIndex(data);
  switch (q.kind) {
    case 'term':
    case 'reverse': {
      if (q.source.type === 'compare') return q;
      const [no, ...others] = q.source.choiceNos;
      const e = idx.get(no);
      if (!e) return q;
      // 誤答も同じ用語のまま、表示だけ新しいデータにする
      const pool = { ...data, glossary: data.glossary.filter((g) => g.no === no || others.includes(g.no)) };
      return (q.kind === 'term' ? makeTermQuestion : makeReverseQuestion)(pool, e, rng);
    }
    case 'compare': {
      if (q.source.type !== 'compare') return q;
      const { themeId, aspect, mode, term } = q.source;
      const theme = data.compare.find((t) => t.id === themeId);
      return theme ? makeCompareQuestion(data, theme, aspect, rng, { mode, term }) : q;
    }
    case 'truefalse': {
      const item = data.cloze.find((c) => c.id === q.clozeId);
      return item ? makeTrueFalse(data, item, rng, q.isTrue) : q;
    }
    case 'matching': {
      // 組はそのままで、用語名と語句だけ新しいデータにする
      return {
        ...q,
        terms: q.terms.map((t) => ({ ...t, name: idx.get(t.no)?.term ?? t.name })),
        phrases: q.phrases.map((p) => {
          const b = data.cloze.find((c) => c.id === p.clozeId)?.blanks.find((x) => x.n === p.n);
          return b ? { ...p, text: stripWrapping(b.answer) } : p;
        }),
      };
    }
  }
}
