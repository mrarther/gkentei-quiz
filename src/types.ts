export type Syllabus = '記載あり' | '関連用語' | '最新動向（シラバス外）';

export interface GlossaryEntry {
  no: number;
  field: string;
  term: string;
  year: string | null;
  syllabus: Syllabus;
  meaning: string;
  keyPoint: string;
  refTitle: string | null;
  refUrl: string | null;
  refLocation: string | null;
  supplement: string | null;
}

export interface ClozeBlank {
  n: number;
  answer: string;
  /** choices[0] が正解（Excel の仕様）。表示時は必ずシャッフルする */
  choices: string[];
}

export interface ClozeItem {
  id: string;
  no: number;
  term: string;
  text: string;
  blanks: ClozeBlank[];
}

export interface CompareFeature {
  term: string;
  no: number;
  text: string;
}

export interface CompareTheme {
  id: string;
  theme: string;
  summary: string;
  terms: { name: string; no: number }[];
  aspects: { name: string; features: CompareFeature[] }[];
}

export interface Dataset {
  glossary: GlossaryEntry[];
  cloze: ClozeItem[];
  compare: CompareTheme[];
}

export type QuizKind = 'term' | 'reverse' | 'matching' | 'truefalse' | 'compare';

/** 問題を作り直す（編集モードで修正したあと）ための元データの情報 */
export type ChoiceSource =
  | { type: 'term' | 'reverse'; no: number; choiceNos: number[] }
  | { type: 'compare'; themeId: string; aspect: string; mode: 'feature2term' | 'term2feature'; term: string };

export interface ChoiceQuestion {
  kind: 'term' | 'reverse' | 'compare';
  source: ChoiceSource;
  /** 苦手リストのキー */
  key: string;
  /** 画面に小さく表示する識別子（問題ID・用語集No など） */
  label: string;
  /** 分野別集計に使う分野 */
  field: string;
  prompt: string;
  /** 用語当てで、問いが用語名（逆引き）か解説かを表示側で切り替える */
  promptIsTerm?: boolean;
  choices: string[];
  correctIndex: number;
  explanationNos: number[];
  summary?: string;
}

export interface MatchingQuestion {
  kind: 'matching';
  key: string;
  label: string;
  field: string;
  /** 用語の表示順（シャッフル済み） */
  terms: { no: number; name: string }[];
  /** 説明の表示順（シャッフル済み）。owner は正解の用語No */
  phrases: { text: string; owner: number; clozeId: string; n: number }[];
  explanationNos: number[];
  /** 各用語の苦手キーと分野 */
  itemKeys: Record<number, { key: string; field: string }>;
}

export interface Segment {
  text: string;
  /** 空欄を埋めた部分。swapped は誤答で置き換えた部分 */
  fill?: { n: number; correct: string; swapped: boolean };
}

export interface TrueFalseQuestion {
  kind: 'truefalse';
  clozeId: string;
  key: string;
  label: string;
  field: string;
  segments: Segment[];
  isTrue: boolean;
  explanationNos: number[];
}

export type Question = ChoiceQuestion | MatchingQuestion | TrueFalseQuestion;
