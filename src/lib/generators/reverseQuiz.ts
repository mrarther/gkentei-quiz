import type { ChoiceQuestion, Dataset, GlossaryEntry } from '../../types';
import { keys } from '../filter';
import { maskTerm, possibleLeaks } from '../mask';
import type { Rng } from '../random';
import { pickDistractors, shuffleChoices, type Warn } from './common';

/** 2. 逆引き（用語 → 解説）。誤答も含めてすべての解説でそれぞれの用語名を伏せる */
export function makeReverseQuestion(data: Dataset, e: GlossaryEntry, rng: Rng, warn?: Warn): ChoiceQuestion {
  const masked = (g: GlossaryEntry) => maskTerm(g.meaning, g.term);
  const { entries, supplemented } = pickDistractors(e, data.glossary, 3, masked, rng);
  if (supplemented) warn?.('supplement', `分野「${e.field}」は語が少ないため、他の分野から誤答を補いました（No.${e.no}）`);
  for (const g of [e, ...entries]) {
    const leaks = possibleLeaks(masked(g), g.term);
    if (leaks.length) warn?.('leak', `No.${g.no}「${g.term}」: 伏せた解説に「${leaks.join('」「')}」が残っています`);
  }
  return {
    kind: 'reverse',
    source: { type: 'reverse', no: e.no, choiceNos: [e.no, ...entries.map((g) => g.no)] },
    key: keys.term(e.no),
    label: `用語集No.${e.no}`,
    field: e.field,
    prompt: e.term,
    promptIsTerm: true,
    ...shuffleChoices(masked(e), entries.map(masked), rng),
    explanationNos: [e.no],
  };
}
