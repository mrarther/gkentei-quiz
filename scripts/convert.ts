/**
 * G検定_用語集.xlsx → src/data/*.json
 *
 * 使い方: npm run convert [-- path/to/book.xlsx]
 * 列は見出し名で探すので、列の順番が変わっても動く。整合性エラーがあれば
 * シート名と行番号を表示して終了コード 1 で終わる。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import type { ClozeItem, CompareTheme, GlossaryEntry, Syllabus } from '../src/types';

XLSX.set_fs(fs);

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, 'G検定_用語集.xlsx'));
const OUT = path.join(ROOT, 'src', 'data');

const errors: string[] = [];
const err = (sheet: string, row: number, msg: string) => errors.push(`[${sheet}] ${row}行目: ${msg}`);

type Row = { _row: number } & Record<string, unknown>;

function readSheet(wb: XLSX.WorkBook, name: string, required: string[]): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) {
    errors.push(`シート「${name}」が見つかりません`);
    return [];
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const header = (aoa[0] ?? []).map((h) => (h == null ? '' : String(h).trim()));
  for (const col of required) {
    if (!header.includes(col)) errors.push(`[${name}] 必須列「${col}」がありません（見出し: ${header.join(', ')}）`);
  }
  const rows: Row[] = [];
  aoa.slice(1).forEach((cells, i) => {
    if (!cells || cells.every((c) => c == null || String(c).trim() === '')) return;
    const r: Row = { _row: i + 2 };
    header.forEach((h, j) => h && (r[h] = cells[j]));
    rows.push(r);
  });
  return rows;
}

/** 文字列化して trim。空欄・「—」は null */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || s === '—' || s === '-' || s === '－' ? null : s;
}

function reqStr(sheet: string, r: Row, col: string): string {
  const s = str(r[col]);
  if (s == null) err(sheet, r._row, `「${col}」が空です`);
  return s ?? '';
}

function int(sheet: string, r: Row, col: string): number {
  const s = str(r[col]);
  const n = s == null ? NaN : Number(s.normalize('NFKC'));
  if (!Number.isInteger(n)) err(sheet, r._row, `「${col}」が整数ではありません: ${s}`);
  return n;
}

const SYLLABUS: Syllabus[] = ['記載あり', '関連用語', '最新動向（シラバス外）'];

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`ファイルが見つかりません: ${SRC}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(SRC);

  // ---- 用語集 ----
  const S1 = '用語集';
  const gRows = readSheet(wb, S1, ['No', '分野', '用語', '発表年', 'G検定シラバス(2024)', '意味（解説）', 'G検定の押さえどころ', '主な参考資料（著者・タイトル）', '参考URL', '参照箇所（章・節・ページ）', '補足資料（名称・箇所・URL）']);
  const glossary: GlossaryEntry[] = gRows.map((r) => {
    const syllabus = reqStr(S1, r, 'G検定シラバス(2024)') as Syllabus;
    if (!SYLLABUS.includes(syllabus)) err(S1, r._row, `シラバス区分が想定外です: ${syllabus}`);
    return {
      no: int(S1, r, 'No'),
      field: reqStr(S1, r, '分野'),
      term: reqStr(S1, r, '用語'),
      year: str(r['発表年']),
      syllabus,
      meaning: reqStr(S1, r, '意味（解説）'),
      keyPoint: reqStr(S1, r, 'G検定の押さえどころ'),
      refTitle: str(r['主な参考資料（著者・タイトル）']),
      refUrl: str(r['参考URL']),
      refLocation: str(r['参照箇所（章・節・ページ）']),
      supplement: str(r['補足資料（名称・箇所・URL）']),
    };
  });
  const byNo = new Map<number, GlossaryEntry>();
  glossary.forEach((g, i) => {
    if (byNo.has(g.no)) err(S1, gRows[i]._row, `No ${g.no} が重複しています`);
    byNo.set(g.no, g);
  });

  // ---- 穴埋め問題 ----
  const S2 = '穴埋め問題';
  const qRows = readSheet(wb, S2, ['問題ID', '用語集No', '用語', '穴あき解説文', '空欄番号', '選択肢1', '選択肢2', '選択肢3', '選択肢4', '正解番号', '正解']);
  const clozeMap = new Map<string, ClozeItem & { _rows: number[] }>();
  for (const r of qRows) {
    const id = reqStr(S2, r, '問題ID');
    const no = int(S2, r, '用語集No');
    const text = reqStr(S2, r, '穴あき解説文');
    const choices = [1, 2, 3, 4].map((k) => reqStr(S2, r, `選択肢${k}`));
    const answer = reqStr(S2, r, '正解');
    const ansNo = int(S2, r, '正解番号');
    if (ansNo !== 1) err(S2, r._row, `正解番号が1ではありません: ${ansNo}`);
    if (answer !== choices[0]) err(S2, r._row, `正解「${answer}」が選択肢1「${choices[0]}」と一致しません`);
    if (new Set(choices).size !== 4) err(S2, r._row, `選択肢が重複しています: ${choices.join(' / ')}`);
    if (!byNo.has(no)) err(S2, r._row, `用語集No ${no} が用語集にありません`);
    let item = clozeMap.get(id);
    if (!item) {
      item = { id, no, term: reqStr(S2, r, '用語'), text, blanks: [], _rows: [] };
      clozeMap.set(id, item);
    } else {
      if (item.text !== text) err(S2, r._row, `${id} の穴あき解説文が他の行と異なります`);
      if (item.no !== no) err(S2, r._row, `${id} の用語集Noが他の行と異なります`);
    }
    item._rows.push(r._row);
    item.blanks.push({ n: int(S2, r, '空欄番号'), answer, choices });
  }
  const cloze: ClozeItem[] = [];
  for (const { _rows, ...item } of clozeMap.values()) {
    item.blanks.sort((a, b) => a.n - b.n);
    const inText = [...new Set([...item.text.matchAll(/【(\d+)】/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    const nums = item.blanks.map((b) => b.n);
    if (new Set(nums).size !== nums.length) err(S2, _rows[0], `${item.id} の空欄番号が重複しています`);
    if (inText.join() !== nums.join()) err(S2, _rows[0], `${item.id} の本文の空欄 [${inText}] と空欄番号 [${nums}] が一致しません`);
    cloze.push(item);
  }

  // ---- 比較テーマ / 比較問題データ ----
  const S3 = '比較テーマ';
  const S4 = '比較問題データ';
  const tRows = readSheet(wb, S3, ['比較ID', 'テーマ', '違いの要点']);
  const cRows = readSheet(wb, S4, ['比較ID', 'テーマ', '観点', '用語', '用語集No', '特徴']);
  const compare: CompareTheme[] = tRows.map((r) => ({
    id: reqStr(S3, r, '比較ID'),
    theme: reqStr(S3, r, 'テーマ'),
    summary: reqStr(S3, r, '違いの要点'),
    terms: [],
    aspects: [],
  }));
  const themeById = new Map(compare.map((t) => [t.id, t]));
  for (const r of cRows) {
    const id = reqStr(S4, r, '比較ID');
    const t = themeById.get(id);
    if (!t) {
      err(S4, r._row, `比較ID ${id} が比較テーマにありません`);
      continue;
    }
    const term = reqStr(S4, r, '用語');
    const no = int(S4, r, '用語集No');
    if (!byNo.has(no)) err(S4, r._row, `用語集No ${no} が用語集にありません`);
    if (!t.terms.some((x) => x.name === term)) t.terms.push({ name: term, no });
    const aspectName = reqStr(S4, r, '観点');
    let aspect = t.aspects.find((a) => a.name === aspectName);
    if (!aspect) t.aspects.push((aspect = { name: aspectName, features: [] }));
    if (aspect.features.some((f) => f.term === term)) err(S4, r._row, `${id}「${aspectName}」に ${term} が2回あります`);
    aspect.features.push({ term, no, text: reqStr(S4, r, '特徴') });
  }
  for (const t of compare) {
    const row = tRows.find((r) => str(r['比較ID']) === t.id)!._row;
    if (t.terms.length < 2) err(S3, row, `${t.id} の用語が2つ未満です（比較問題データ）`);
    for (const a of t.aspects) {
      if (a.features.length !== t.terms.length) err(S4, 0, `${t.id}「${a.name}」に欠けている用語があります`);
      if (new Set(a.features.map((f) => f.text)).size !== a.features.length) err(S4, 0, `${t.id}「${a.name}」に同じ特徴があります`);
    }
  }

  if (errors.length) {
    console.error(`変換エラー ${errors.length} 件:`);
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const write = (name: string, data: unknown) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n');
  write('glossary.json', glossary);
  write('cloze.json', cloze);
  write('compare.json', compare);
  console.log(`変換完了: ${path.basename(SRC)}`);
  console.log(`  用語集 ${glossary.length} 語 / 穴埋め ${cloze.length} 問（空欄 ${qRows.length}）/ 比較 ${compare.length} テーマ（特徴 ${cRows.length}）`);
}

main();
