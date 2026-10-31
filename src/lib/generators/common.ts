import type { GlossaryEntry } from '../../types';
import { shuffle, type Rng } from '../random';

/** audit 用の警告コールバック（UI では渡さない） */
export type Warn = (code: string, message: string) => void;

/**
 * 誤答候補: 同じ分野の別の用語を優先し、足りなければ他の分野から補う。
 * toText で表示用の文字列に変えたとき、正解や他の候補と重なるものは飛ばす。
 */
export function pickDistractors(
  target: GlossaryEntry,
  glossary: GlossaryEntry[],
  n: number,
  toText: (e: GlossaryEntry) => string,
  rng: Rng,
): { entries: GlossaryEntry[]; supplemented: boolean } {
  const others = glossary.filter((g) => g.no !== target.no);
  const ordered = [
    ...shuffle(others.filter((g) => g.field === target.field), rng),
    ...shuffle(others.filter((g) => g.field !== target.field), rng),
  ];
  const seen = new Set([toText(target)]);
  const entries: GlossaryEntry[] = [];
  for (const g of ordered) {
    if (entries.length >= n) break;
    const t = toText(g);
    if (seen.has(t)) continue;
    seen.add(t);
    entries.push(g);
  }
  return { entries, supplemented: entries.some((e) => e.field !== target.field) };
}

/** 正解を先頭に置いた配列をシャッフルし、正解の位置を返す */
export function shuffleChoices(correct: string, wrong: string[], rng: Rng): { choices: string[]; correctIndex: number } {
  const order = shuffle([0, ...wrong.map((_, i) => i + 1)], rng);
  const all = [correct, ...wrong];
  return { choices: order.map((i) => all[i]), correctIndex: order.indexOf(0) };
}
