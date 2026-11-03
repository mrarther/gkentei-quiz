import type { ChoiceQuestion, CompareTheme, Dataset } from '../../types';
import { keys } from '../filter';
import { maskText, termAliases } from '../mask';
import { pick, type Rng } from '../random';
import { shuffleChoices, type Warn } from './common';

export type CompareMode = 'feature2term' | 'term2feature';

/**
 * 5. 比較問題。
 *  - feature2term: 「次の特徴を持つのはどれ？」→ 選択肢はテーマの全用語
 *  - term2feature: 「BERTの『文脈の向き』はどれ？」→ 選択肢は同じ観点の全用語の特徴
 * 特徴の文にテーマ内の用語名が出てくると消去法で分かるので、テーマ内の全用語名を伏せる。
 */
export function makeCompareQuestion(
  data: Dataset,
  theme: CompareTheme,
  aspectName: string,
  rng: Rng,
  opts: { mode?: CompareMode; term?: string } = {},
  warn?: Warn,
): ChoiceQuestion {
  const aspect = theme.aspects.find((a) => a.name === aspectName)!;
  const mode = opts.mode ?? (rng() < 0.5 ? 'feature2term' : 'term2feature');
  const target = aspect.features.find((f) => f.term === opts.term) ?? pick(aspect.features, rng);
  const aliases = [...new Set(theme.terms.flatMap((t) => termAliases(t.name)))].sort((a, b) => [...b].length - [...a].length);
  const mask = (s: string) => {
    const m = maskText(s, aliases);
    if (m !== s) warn?.('compare-mask', `${theme.id}「${aspectName}」: 特徴の文に用語名があったため伏せました: ${s}`);
    return m;
  };
  const field = data.glossary.find((g) => g.no === target.no)?.field ?? '';
  const base = {
    kind: 'compare' as const,
    source: { type: 'compare' as const, themeId: theme.id, aspect: aspectName, mode, term: target.term },
    key: keys.compare(theme.id, aspectName),
    label: `${theme.id}／${aspectName}（用語集No.${target.no}）`,
    field,
    explanationNos: [...new Set(theme.terms.map((t) => t.no))],
    summary: theme.summary,
  };
  if (mode === 'feature2term') {
    const others = theme.terms.map((t) => t.name).filter((n) => n !== target.term);
    return {
      ...base,
      prompt: `【${theme.theme}】「${aspectName}」について、次の特徴を持つのはどれ？\n${mask(target.text)}`,
      ...shuffleChoices(target.term, others, rng),
    };
  }
  const others = aspect.features.filter((f) => f.term !== target.term).map((f) => mask(f.text));
  return {
    ...base,
    prompt: `【${theme.theme}】${target.term} の「${aspectName}」はどれ？`,
    ...shuffleChoices(mask(target.text), others, rng),
  };
}
