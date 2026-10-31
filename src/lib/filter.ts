import type { Dataset, GlossaryEntry, Syllabus } from '../types';

export interface QuizFilter {
  /** 空なら全分野 */
  fields: string[];
  /** 空なら全区分 */
  syllabus: Syllabus[];
  /** 指定されていれば、このキーに当たるものだけを出す（苦手復習モード） */
  weakKeys?: Set<string>;
}

export const noFilter: QuizFilter = { fields: [], syllabus: [] };

export function entryPasses(e: GlossaryEntry | undefined, f: QuizFilter): boolean {
  if (!e) return false;
  if (f.fields.length && !f.fields.includes(e.field)) return false;
  if (f.syllabus.length && !f.syllabus.includes(e.syllabus)) return false;
  return true;
}

export function glossaryIndex(data: Dataset): Map<number, GlossaryEntry> {
  return new Map(data.glossary.map((g) => [g.no, g]));
}

/** 苦手リストのキー */
export const keys = {
  term: (no: number) => `term:${no}`,
  cloze: (id: string) => `cloze:${id}`,
  compare: (id: string, aspect: string) => `compare:${id}:${aspect}`,
};
