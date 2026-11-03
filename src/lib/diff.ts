/** 2つの文字列の、先頭と末尾の共通部分を除いた違い（修正の一覧で、直した箇所を示すのに使う） */
export function diffParts(before: string, after: string) {
  let i = 0;
  while (i < Math.min(before.length, after.length) && before[i] === after[i]) i++;
  let j = 0;
  while (j < Math.min(before.length, after.length) - i && before[before.length - 1 - j] === after[after.length - 1 - j]) j++;
  return {
    prefix: before.slice(0, i),
    removed: before.slice(i, before.length - j),
    added: after.slice(i, after.length - j),
    suffix: before.slice(before.length - j),
  };
}
