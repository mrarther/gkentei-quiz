import type { ClozeItem, Dataset, Segment, TrueFalseQuestion } from '../../types';
import { keys } from '../filter';
import { pick, type Rng } from '../random';

/**
 * 4. 正誤（○×）。穴埋め1問の空欄をすべて正解で埋めた文（正しい文）か、
 * 1つの空欄だけ誤答の選択肢で埋めた文（誤りの文）を作る。同じ番号の空欄はすべて同じ語句で埋める。
 */
export function makeTrueFalse(data: Dataset, item: ClozeItem, rng: Rng, forceTrue?: boolean): TrueFalseQuestion {
  const isTrue = forceTrue ?? rng() < 0.5;
  const swappedBlank = isTrue ? null : pick(item.blanks, rng);
  const wrongWord = swappedBlank ? pick(swappedBlank.choices.slice(1), rng) : null;
  const segments: Segment[] = [];
  const re = /【(\d+)】/g;
  let pos = 0;
  for (const m of item.text.matchAll(re)) {
    if (m.index! > pos) segments.push({ text: item.text.slice(pos, m.index) });
    const n = Number(m[1]);
    const blank = item.blanks.find((b) => b.n === n)!;
    const swapped = swappedBlank?.n === n;
    segments.push({ text: swapped ? wrongWord! : blank.answer, fill: { n, correct: blank.answer, swapped } });
    pos = m.index! + m[0].length;
  }
  if (pos < item.text.length) segments.push({ text: item.text.slice(pos) });
  const entry = data.glossary.find((g) => g.no === item.no);
  return {
    kind: 'truefalse',
    clozeId: item.id,
    key: keys.cloze(item.id),
    label: `${item.id}（用語集No.${item.no}）`,
    field: entry?.field ?? '',
    segments,
    isTrue,
    explanationNos: [item.no],
  };
}

export const sentenceOf = (q: TrueFalseQuestion) => q.segments.map((s) => s.text).join('');
