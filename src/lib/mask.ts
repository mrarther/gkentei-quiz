/**
 * 用語名を解説文から伏せる処理。
 *
 * 伏せる対象（エイリアス）:
 *  1. 括弧の外側にある「／」「 / 」で分けた各部分
 *  2. 各部分の括弧の前（「Chain-of-Thought（CoT）プロンプティング」なら前だけ／前＋後ろの両方）
 *  3. 括弧の中の正式名。さらに「：」「:」「・」「、」「／」で分け、末尾の「など」を取る
 *  4. 「Few-shot / One-shot / Zero-shot 学習」のような共通の和文接尾語を外した形
 *  5. 「AIC・BIC」のような「・」区切りの各部分。ただし「プライバシー・バイ・デザイン」
 *     のように2文字以下のかなだけの部分ができる場合は1語とみなして分けない
 * 2文字未満と、数字・年だけのもの（「2026年」など）は捨てる。
 * 照合は全角半角・大文字小文字を区別しない。
 */

export const MASK = '〇〇';

const OPEN = '（(';
const CLOSE = '）)';

/** 括弧の外側だけで区切る */
function splitTopLevel(s: string, seps: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const m = s.slice(i).match(seps);
      if (m && m.index === 0) {
        out.push(buf);
        buf = '';
        i += m[0].length - 1;
        continue;
      }
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 「A（B）C」を { before: A, after: C, inner: [B] } に分解（トップレベルの括弧のみ） */
function splitParens(seg: string): { before: string; after: string; inner: string[] } {
  const inner: string[] = [];
  let depth = 0;
  let outside = '';
  let before: string | null = null;
  let cur = '';
  for (const ch of seg) {
    if (OPEN.includes(ch)) {
      if (depth === 0) {
        if (before == null) before = outside;
        cur = '';
      } else cur += ch;
      depth++;
    } else if (CLOSE.includes(ch) && depth > 0) {
      depth--;
      if (depth === 0) inner.push(cur);
      else cur += ch;
    } else if (depth > 0) cur += ch;
    else outside += ch;
  }
  const b = (before ?? outside).trim();
  const after = before == null ? '' : outside.slice(before.length).trim();
  return { before: b, after, inner };
}

const INNER_SEP = /^(：|:|、|／| \/ |\/)/;

/** 「・」で分けてよいか（「バイ」「キー」のような短いかなだけの部分ができるなら分けない） */
function splitNakaguro(s: string): string[] {
  const parts = splitTopLevel(s, /^・/);
  if (parts.length < 2 || parts.some((p) => /^[\u3040-\u30ffー]{1,2}$/.test(p))) return [];
  return parts;
}

const aliasCache = new Map<string, string[]>();

export function termAliases(term: string): string[] {
  const cached = aliasCache.get(term);
  if (cached) return cached;
  const set = new Set<string>();
  const add = (s: string) => {
    const t = s.replace(/\s*など$/, '').trim();
    if ([...t].length >= 2 && !/^[\d０-９\s年月日〜～第次]+$/.test(t)) set.add(t);
  };
  const segs = splitTopLevel(term, /^(／| \/ )/);
  // 4. 共通の接尾語（最後の部分だけに付いている「 学習」など）を外す
  if (segs.length > 1) {
    const last = segs[segs.length - 1];
    const m = last.match(/^(.+?)\s+([^\sA-Za-z0-9（(）)]+)$/);
    if (m && segs.slice(0, -1).every((s) => !/\s/.test(s))) add(m[1]);
  }
  const addPart = (p: string) => {
    add(p);
    splitNakaguro(p).forEach(add);
    // 入れ子の括弧も分解
    const sub = splitParens(p);
    add(sub.before);
    sub.inner.forEach(add);
  };
  for (const seg of segs) {
    add(seg);
    const { before, after, inner } = splitParens(seg);
    addPart(before);
    if (after) add(`${before}${after}`), add(`${before} ${after}`);
    for (const inn of inner) {
      add(inn);
      splitTopLevel(inn, INNER_SEP).forEach(addPart);
    }
  }
  const list = [...set].sort((a, b) => [...b].length - [...a].length);
  aliasCache.set(term, list);
  return list;
}

/** 比較用に正規化した文字列と、正規化後の各文字 → 元の位置の対応表 */
function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let idx = 0;
  for (const ch of s) {
    const n = ch.normalize('NFKC').toLowerCase();
    for (const c of n) {
      norm += c;
      map.push(idx);
    }
    idx += ch.length;
  }
  map.push(s.length);
  return { norm, map };
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const isAsciiAlnum = (c: string | undefined) => !!c && /[a-z0-9]/i.test(c);
const isAsciiLetter = (c: string | undefined) => !!c && /[a-z]/i.test(c);

/**
 * text の中で aliases に一致する範囲を返す（長いもの優先、重なりなし）。
 * 英字で始まる／終わるエイリアスは、隣が英字のときは一致とみなさない
 * （「GPT-4」が「GPT-4o」の一部に一致する、などを防ぐ）。
 */
export function findAliasRanges(text: string, aliases: string[]): [number, number][] {
  const { norm: nt, map } = normalizeWithMap(text);
  const taken: [number, number][] = [];
  for (const alias of aliases) {
    const na = norm(alias);
    if (!na) continue;
    let from = 0;
    while (true) {
      const i = nt.indexOf(na, from);
      if (i < 0) break;
      const j = i + na.length;
      from = i + 1;
      if (isAsciiAlnum(na[0]) && isAsciiLetter(nt[i - 1])) continue;
      if (isAsciiAlnum(na[na.length - 1]) && isAsciiLetter(nt[j])) continue;
      if (taken.some(([a, b]) => i < b && j > a)) continue;
      taken.push([i, j]);
    }
  }
  return taken
    .sort((a, b) => a[0] - b[0])
    .map(([i, j]) => [map[i], map[j]] as [number, number]);
}

export function maskText(text: string, aliases: string[]): string {
  const ranges = findAliasRanges(text, aliases);
  let out = '';
  let pos = 0;
  for (const [a, b] of ranges) {
    out += text.slice(pos, a) + MASK;
    pos = b;
  }
  return out + text.slice(pos);
}

export function maskTerm(text: string, term: string): string {
  return maskText(text, termAliases(term));
}

/** 伏せたあとに残っているエイリアス（本来 0 件のはず） */
export function remainingAliases(masked: string, term: string): string[] {
  return termAliases(term).filter((a) => findAliasRanges(masked, [a]).length > 0);
}

/** 一般的すぎて用語名の一部でもヒントにならない英単語 */
const GENERIC = new Set(
  'the and for with from model models network networks learning layer layers deep neural based via of in on to by an act law ai'
    .split(' '),
);

/**
 * 伏せきれなかった可能性のある語（警告用）:
 * 用語名に含まれる英数字の語（3文字以上）のうち、伏せた後の文に残っているもの。
 * 他の用語を指していることもあるので、エラーではなく警告として扱う。
 */
export function possibleLeaks(masked: string, term: string): string[] {
  const tokens = new Set(term.match(/[A-Za-z][A-Za-z0-9-]*[A-Za-z0-9]/g) ?? []);
  return [...tokens].filter((t) => [...t].length >= 3 && !GENERIC.has(t.toLowerCase()) && findAliasRanges(masked, [t]).length > 0);
}
