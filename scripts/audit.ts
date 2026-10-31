/**
 * 全データについて各クイズを1回ずつ生成し、エラーと警告を一覧表示する。
 * 使い方: npm run audit   （エラーがあれば終了コード 1）
 */
import type { ChoiceQuestion, Dataset } from '../src/types';
import glossary from '../src/data/glossary.json';
import cloze from '../src/data/cloze.json';
import compare from '../src/data/compare.json';
import { seeded } from '../src/lib/random';
import { remainingAliases } from '../src/lib/mask';
import { makeTermQuestion } from '../src/lib/generators/termQuiz';
import { makeReverseQuestion } from '../src/lib/generators/reverseQuiz';
import { buildMatchingSets, countValidAssignments, matchingPhrases, MATCH_SIZE } from '../src/lib/generators/matching';
import { makeTrueFalse, sentenceOf } from '../src/lib/generators/trueFalse';
import { makeCompareQuestion } from '../src/lib/generators/compare';

const data = { glossary, cloze, compare } as Dataset;
const rng = seeded(20261030);

const errors: string[] = [];
const warnings = new Map<string, Set<string>>();
const warn = (code: string, msg: string) => {
  if (!warnings.has(code)) warnings.set(code, new Set());
  warnings.get(code)!.add(msg);
};

function checkChoices(q: ChoiceQuestion, where: string) {
  if (new Set(q.choices).size !== q.choices.length) errors.push(`${where}: 選択肢が重複しています: ${q.choices.join(' | ')}`);
  if (q.correctIndex < 0 || q.correctIndex >= q.choices.length) errors.push(`${where}: 正解が選択肢に含まれていません`);
}

let n = { term: 0, reverse: 0, matching: 0, truefalse: 0, compare: 0 };

// 1, 2: 用語当て / 逆引き
for (const e of data.glossary) {
  const q1 = makeTermQuestion(data, e, rng, warn);
  checkChoices(q1, `用語当て No.${e.no}`);
  if (q1.choices.length !== 4) errors.push(`用語当て No.${e.no}: 選択肢が4つではありません`);
  const rest = remainingAliases(q1.prompt, e.term);
  if (rest.length) errors.push(`用語当て No.${e.no}: 用語名「${rest.join('」「')}」が伏せられていません`);
  n.term++;

  const q2 = makeReverseQuestion(data, e, rng, warn);
  checkChoices(q2, `逆引き No.${e.no}`);
  n.reverse++;
}

// 3: マッチング（全用語を使い切るまで組を作る）
const phrases = matchingPhrases(data);
for (const e of data.glossary) {
  if (!phrases.get(e.no)?.length) warn('no-phrase', `No.${e.no}「${e.term}」: マッチングに使える語句（4文字以上・数字や社名だけでない正解）がありません`);
}
const sets = buildMatchingSets(data, data.glossary, Infinity, rng);
for (const q of sets) {
  const c = countValidAssignments(q, data);
  if (c !== 1) errors.push(`マッチング ${q.label}: 正解の割り当てが ${c} 通りあります`);
  if (q.terms.length !== MATCH_SIZE || new Set(q.phrases.map((p) => p.text)).size !== MATCH_SIZE) errors.push(`マッチング ${q.label}: 組の数か語句が不正です`);
  n.matching++;
}
const usedInMatching = new Set(sets.flatMap((q) => q.terms.map((t) => t.no)));
const unused = data.glossary.filter((e) => phrases.get(e.no)?.length && !usedInMatching.has(e.no));
if (unused.length) warn('matching-leftover', `全語を1回ずつ使う組分けで、組に入らなかった語 ${unused.length} 件（出題時は毎回組み直すので問題なし）: ${unused.map((e) => e.no).join(', ')}`);

// 4: 正誤（正しい文と誤りの文の両方）
for (const c of data.cloze) {
  const t = makeTrueFalse(data, c, rng, true);
  const f = makeTrueFalse(data, c, rng, false);
  if (/【\d+】/.test(sentenceOf(t)) || /【\d+】/.test(sentenceOf(f))) errors.push(`正誤 ${c.id}: 埋まっていない空欄があります`);
  if (sentenceOf(t) === sentenceOf(f)) errors.push(`正誤 ${c.id}: 誤りの文が正しい文と同じです`);
  if (f.segments.filter((s) => s.fill?.swapped).length < 1) errors.push(`正誤 ${c.id}: 入れ替えた箇所がありません`);
  n.truefalse += 2;
}

// 5: 比較（全テーマ × 全観点 × 全用語 × 2形式）
for (const t of data.compare) {
  for (const a of t.aspects) {
    for (const f of a.features) {
      for (const mode of ['feature2term', 'term2feature'] as const) {
        const q = makeCompareQuestion(data, t, a.name, rng, { mode, term: f.term }, warn);
        checkChoices(q, `比較 ${t.id}「${a.name}」${f.term} ${mode}`);
        if (q.choices.length !== t.terms.length) errors.push(`比較 ${t.id}: 選択肢の数 ${q.choices.length} がテーマの用語数 ${t.terms.length} と違います`);
        n.compare++;
      }
    }
  }
}

const LABEL: Record<string, string> = {
  leak: '伏せきれなかった可能性のある語（他の用語を指している場合もあります）',
  supplement: '他の分野から誤答を補った分野',
  'no-phrase': 'マッチングに出せない用語',
  'matching-leftover': 'マッチングの組分け',
  'compare-mask': '比較: 特徴の文の中で用語名を伏せたもの',
};

console.log('=== 生成数 ===');
console.log(`用語当て ${n.term} / 逆引き ${n.reverse} / マッチング ${n.matching}組 / 正誤 ${n.truefalse} / 比較 ${n.compare}`);
console.log(`\n=== エラー: ${errors.length} 件 ===`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`\n=== 警告 ===`);
for (const [code, msgs] of warnings) {
  // 同じ分野の補充は分野ごとに1行にまとめる
  const list = code === 'supplement' ? [...new Set([...msgs].map((m) => m.replace(/（No\.\d+）$/, '')))] : [...msgs];
  console.log(`\n■ ${LABEL[code] ?? code}（${list.length} 件）`);
  list.forEach((m) => console.log('  - ' + m));
}
process.exit(errors.length ? 1 : 0);
