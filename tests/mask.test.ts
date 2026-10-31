import { describe, expect, it } from 'vitest';
import { maskTerm, remainingAliases, termAliases } from '../src/lib/mask';

describe('termAliases', () => {
  it('括弧の前と括弧の中の正式名', () => {
    expect(termAliases('CLIP（Contrastive Language-Image Pre-training）')).toEqual(
      expect.arrayContaining(['CLIP', 'Contrastive Language-Image Pre-training']),
    );
  });
  it('括弧の中の「:」区切り', () => {
    expect(termAliases('変分オートエンコーダー（VAE: Variational Autoencoder）')).toEqual(
      expect.arrayContaining(['変分オートエンコーダー', 'VAE', 'Variational Autoencoder']),
    );
  });
  it('「／」と「 / 」で分ける', () => {
    expect(termAliases('Q学習／SARSA')).toEqual(expect.arrayContaining(['Q学習', 'SARSA']));
    expect(termAliases('GPT-4 / GPT-4V / GPT-4o')).toEqual(expect.arrayContaining(['GPT-4', 'GPT-4V', 'GPT-4o']));
  });
  it('括弧の中の「・」区切り', () => {
    expect(termAliases('回帰の評価指標（MSE・RMSE・MAE）')).toEqual(expect.arrayContaining(['MSE', 'RMSE', 'MAE']));
  });
  it('短いかなを含む「・」付きの名前は分けない', () => {
    const a = termAliases('プライバシー・バイ・デザイン／セキュリティ・バイ・デザイン');
    expect(a).not.toContain('バイ');
    expect(a).not.toContain('デザイン');
  });
  it('共通の和文接尾語を外した形も伏せる', () => {
    expect(termAliases('Few-shot / One-shot / Zero-shot 学習')).toEqual(expect.arrayContaining(['Few-shot', 'Zero-shot']));
    expect(termAliases('Cutout／Random Erasing')).not.toContain('Random');
  });
  it('数字だけの括弧は使わない', () => {
    expect(termAliases('改正個人情報保護法（2026年）：AI開発・統計作成目的の同意不要化')).not.toContain('2026年');
  });
});

describe('maskTerm', () => {
  it('解説の中の用語名を〇〇に置き換える', () => {
    expect(maskTerm('Double DQNでは過大評価を抑える', 'Double DQN（DDQN）')).toBe('〇〇では過大評価を抑える');
  });
  it('長い名前を優先する（GPT-4o を GPT-4 + o にしない）', () => {
    expect(maskTerm('GPT-4oはGPT-4の後継', 'GPT-4 / GPT-4V / GPT-4o')).toBe('〇〇は〇〇の後継');
  });
  it('全角半角・大文字小文字を区別しない', () => {
    expect(maskTerm('ｃｌｉｐ は…', 'CLIP（Contrastive Language-Image Pre-training）')).toBe('〇〇 は…');
  });
  it('英字の途中には一致しない', () => {
    expect(maskTerm('SAMPLE と SAM', 'SAM（Segment Anything Model）')).toBe('SAMPLE と 〇〇');
  });
  it('伏せた後にエイリアスが残らない', () => {
    const t = 'RAG（Retrieval-Augmented Generation／検索拡張生成）';
    expect(remainingAliases(maskTerm('RAG（検索拡張生成）は Retrieval-Augmented Generation の略', t), t)).toEqual([]);
  });
});
