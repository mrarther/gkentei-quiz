import type { Dataset, GlossaryEntry, MatchingQuestion } from '../../types';
import { keys } from '../filter';
import { findAliasRanges, termAliases } from '../mask';
import { shuffle, type Rng } from '../random';

export const MATCH_SIZE = 5;

/** 社名・組織名だけの語句（どの用語にも当てはまりうるので使わない） */
const ORG =
  /^(google|google deepmind|deepmind|openai|meta|facebook|microsoft|anthropic|ibm|nvidia|amazon|apple|baidu|tesla|xai|stability ai|hugging face|alibaba|tencent|deepseek|.+大学|.+研究所)$/i;
/** 数字（＋単位）だけの語句 */
const NUMERIC = /^[\d０-９.,．、%％×xX〜～\-−\s約第]+(年|年代|月|日|回|個|つ|層|位|倍|次元|ビット|bit|億|万|千|件|段階|種類|語|組|枚|次|割|%|％)?$/;

/** 語句全体を囲む括弧・かぎ括弧を外す（「（有用性）」→「有用性」） */
export function stripWrapping(s: string): string {
  let t = s.trim();
  for (;;) {
    const m = t.match(/^(「(.*)」|『(.*)』|（(.*)）|\((.*)\))$/);
    const inner = m && (m[2] ?? m[3] ?? m[4] ?? m[5]);
    if (inner == null || /[」』）)]/.test(inner.replace(/[「『（(][^」』）)]*[」』）)]/g, ''))) return t;
    t = inner.trim();
  }
}

export function isUsablePhrase(s: string): boolean {
  const t = stripWrapping(s);
  // 「Facebook（現Meta）」のような補足の括弧は外して判定する
  const core = t.replace(/[（(][^）)]*[）)]/g, '').trim();
  // 数字・記号・空白を除いた文字が3文字未満なら、実質は数字だけ（例: 「5,400億（540B）」「1/8〜1/9」）
  const letters = t.replace(/[\d０-９\s\p{P}\p{S}]/gu, '');
  // 「1回だけ」「2段階」のような「数字＋助数詞（1〜2文字）＋かな」も数字だけとみなす
  const counted = /^[\d０-９.,〜～\-\s約第]+\S{1,2}[\u3040-\u309f]*$/.test(core);
  return [...t].length >= 4 && !ORG.test(core) && !NUMERIC.test(core) && !counted && [...letters].length >= 3;
}

const contains = (text: string, phrase: string) => findAliasRanges(text, [phrase]).length > 0;

/** 用語No → マッチングに使える語句（穴埋めの正解のうち条件を満たすもの） */
export function matchingPhrases(data: Dataset): Map<number, { text: string; clozeId: string }[]> {
  const map = new Map<number, { text: string; clozeId: string }[]>();
  const byNo = new Map(data.glossary.map((g) => [g.no, g]));
  for (const c of data.cloze) {
    const g = byNo.get(c.no);
    if (!g) continue;
    for (const b of c.blanks) {
      const text = stripWrapping(b.answer);
      if (!isUsablePhrase(text)) continue;
      // 語句が用語名そのもの（を含む）なら答えが分かってしまう
      if (findAliasRanges(text, termAliases(g.term)).length) continue;
      const list = map.get(c.no) ?? [];
      if (!list.some((x) => x.text === text)) list.push({ text, clozeId: c.id });
      map.set(c.no, list);
    }
  }
  return map;
}

type Pair = { e: GlossaryEntry; phrase: { text: string; clozeId: string } };

/** 既に選んだ組と衝突しない語句を探す（語句は自分の解説にだけ出てくること） */
function fitPhrase(e: GlossaryEntry, chosen: Pair[], phrases: { text: string; clozeId: string }[], rng: Rng) {
  if (chosen.some((p) => p.e.term === e.term)) return null;
  // 既に選んだ語句が、新しい用語の解説に出てくるなら、その用語は入れられない
  if (chosen.some((p) => contains(e.meaning, p.phrase.text))) return null;
  for (const ph of shuffle(phrases, rng)) {
    if (chosen.some((p) => p.phrase.text === ph.text || contains(p.e.meaning, ph.text))) continue;
    return ph;
  }
  return null;
}

/** pairs から問題を作る */
function toQuestion(pairs: Pair[], rng: Rng): MatchingQuestion {
  return {
    kind: 'matching',
    key: pairs.map((p) => keys.term(p.e.no)).join(','),
    label: `用語集No.${pairs.map((p) => p.e.no).join(', ')}`,
    field: pairs[0].e.field,
    terms: shuffle(pairs.map((p) => ({ no: p.e.no, name: p.e.term })), rng),
    phrases: shuffle(pairs.map((p) => ({ text: p.phrase.text, owner: p.e.no, clozeId: p.phrase.clozeId })), rng),
    explanationNos: pairs.map((p) => p.e.no),
    itemKeys: Object.fromEntries(pairs.map((p) => [p.e.no, { key: keys.term(p.e.no), field: p.e.field }])),
  };
}

/**
 * pool の用語から、正解が1通りに決まるマッチング問題を最大 count 問作る。
 * 1問の中で、各語句は「選んだ5語のうち自分の用語の解説にだけ出てくる」。
 * 同じ用語は複数の問題で使わない。
 */
export function buildMatchingSets(data: Dataset, pool: GlossaryEntry[], count: number, rng: Rng): MatchingQuestion[] {
  const phrases = matchingPhrases(data);
  let remaining = shuffle(pool.filter((e) => phrases.get(e.no)?.length), rng);
  const out: MatchingQuestion[] = [];
  while (out.length < count && remaining.length >= MATCH_SIZE) {
    const chosen: Pair[] = [];
    const rest: GlossaryEntry[] = [];
    for (const e of remaining) {
      if (chosen.length >= MATCH_SIZE) {
        rest.push(e);
        continue;
      }
      const ph = fitPhrase(e, chosen, phrases.get(e.no)!, rng);
      if (ph) chosen.push({ e, phrase: ph });
      else rest.push(e);
    }
    if (chosen.length < MATCH_SIZE) break;
    out.push(toQuestion(chosen, rng));
    remaining = rest;
  }
  return out;
}

/** 正解の割り当てが何通りあるか（テスト・audit 用。1 なら一意） */
export function countValidAssignments(q: MatchingQuestion, data: Dataset): number {
  const byNo = new Map(data.glossary.map((g) => [g.no, g]));
  const fits = q.phrases.map((p) => q.terms.filter((t) => contains(byNo.get(t.no)!.meaning, p.text)).map((t) => t.no));
  let count = 0;
  const used = new Set<number>();
  const rec = (i: number) => {
    if (i === fits.length) return void count++;
    for (const no of fits[i]) {
      if (used.has(no)) continue;
      used.add(no);
      rec(i + 1);
      used.delete(no);
    }
  };
  rec(0);
  return count;
}
