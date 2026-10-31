import type { QuizKind } from '../types';

const KEY = 'gken-quiz:v1';
const HISTORY_MAX = 50;

export interface AnswerRecord {
  key: string;
  label: string;
  field: string;
  correct: boolean;
}

export interface SessionRecord {
  at: number;
  kind: QuizKind;
  total: number;
  correct: number;
}

export interface StoredState {
  wrong: Record<string, { count: number; lastAt: number; label: string }>;
  history: SessionRecord[];
  settings?: unknown;
}

const empty = (): StoredState => ({ wrong: {}, history: [] });

export function load(): StoredState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw) as Partial<StoredState>;
    return { wrong: s.wrong ?? {}, history: s.history ?? [], settings: s.settings };
  } catch {
    return empty();
  }
}

function save(s: StoredState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* プライベートモードなどで保存できなくても動作は続ける */
  }
}

/** 1問ごとに呼ぶ。間違えたら苦手に追加、正解したら苦手から外す */
export function recordAnswer(r: AnswerRecord): void {
  const s = load();
  if (r.correct) delete s.wrong[r.key];
  else s.wrong[r.key] = { count: (s.wrong[r.key]?.count ?? 0) + 1, lastAt: Date.now(), label: r.label };
  save(s);
}

export function recordSession(rec: SessionRecord): void {
  const s = load();
  s.history = [rec, ...s.history].slice(0, HISTORY_MAX);
  save(s);
}

export function saveSettings(settings: unknown): void {
  const s = load();
  s.settings = settings;
  save(s);
}

export function clearWrong(): void {
  const s = load();
  s.wrong = {};
  save(s);
}
