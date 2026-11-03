import type { ChoiceQuestion, Dataset, GlossaryEntry } from '../../types';
import { keys } from '../filter';
import { maskTerm, possibleLeaks } from '../mask';
import type { Rng } from '../random';
import { pickDistractors, shuffleChoices, type Warn } from './common';

/** 1. 用語当て（解説 → 用語） */
export function makeTermQuestion(data: Dataset, e: GlossaryEntry, rng: Rng, warn?: Warn): ChoiceQuestion {
  const prompt = maskTerm(e.meaning, e.term);
  const leaks = possibleLeaks(prompt, e.term);
  if (leaks.length) warn?.('leak', `No.${e.no}「${e.term}」: 伏せた解説に「${leaks.join('」「')}」が残っています`);
  const { entries, supplemented } = pickDistractors(e, data.glossary, 3, (g) => g.term, rng);
  if (supplemented) warn?.('supplement', `分野「${e.field}」は語が少ないため、他の分野から誤答を補いました（No.${e.no}）`);
  return {
    kind: 'term',
    source: { type: 'term', no: e.no, choiceNos: [e.no, ...entries.map((g) => g.no)] },
    key: keys.term(e.no),
    label: `用語集No.${e.no}`,
    field: e.field,
    prompt,
    ...shuffleChoices(e.term, entries.map((g) => g.term), rng),
    explanationNos: [e.no],
  };
}
