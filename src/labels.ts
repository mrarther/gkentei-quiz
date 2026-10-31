import type { QuizKind } from './types';

export const KIND_LABEL: Record<QuizKind, string> = {
  term: '用語当て（解説→用語）',
  reverse: '逆引き（用語→解説）',
  matching: '組み合わせ（マッチング）',
  truefalse: '正誤判定（○×）',
  compare: '比較問題（AとBの違い）',
};
