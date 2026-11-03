"""
サイトの編集モードで書き出した修正（edits-*.json）を G検定_用語集.xlsx に書き戻す。

使い方:
    npm run apply-edits -- edits-20261103-1530.json [ほかの edits.json ...]
    npm run apply-edits -- --dry-run edits.json     # 書き込まずに内容だけ確認
    npm run apply-edits -- --force edits.json       # Excel 側が変わっていても上書き

- 書き込むのは修正したセルだけ。行の色・数式・フィルタ・枠の固定などはそのまま残る。
- 修正したセルの文字の書式（太字・色など）は、元のセルの書式を引き継ぐ。
- 直す前の値（before）が今の Excel と違うセルは、別の修正とぶつかっている可能性があるので
  書き込まずに一覧に出す（--force で上書き）。
- 「穴埋め問題」の選択肢1を直すと、同じ行の「正解」も同じ値にする。
- 「穴あき解説文」は同じ問題IDの全行を直す。

必要なもの: Python 3 と openpyxl（pip3 install openpyxl）
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import openpyxl
    from openpyxl.cell.rich_text import CellRichText, TextBlock
except ImportError:
    sys.exit("openpyxl が必要です: pip3 install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
BOOK = ROOT / "G検定_用語集.xlsx"

# サイトから直せる列（これ以外は受け付けない）
EDITABLE = {
    "用語集": {"用語", "意味（解説）", "G検定の押さえどころ"},
    "穴埋め問題": {"穴あき解説文", "選択肢1", "選択肢2", "選択肢3", "選択肢4"},
    "比較テーマ": {"違いの要点"},
    "比較問題データ": {"特徴"},
}


def text_of(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def with_same_font(old, text: str):
    """元のセルが書式付き文字なら、先頭の書式で新しい文字を書く"""
    if isinstance(old, CellRichText):
        for block in old:
            if isinstance(block, TextBlock):
                return CellRichText([TextBlock(block.font, text)])
    return text


def short_diff(before: str, after: str, context: int = 15) -> str:
    """変わった部分だけを前後の文脈付きで示す（例: …の分布が[変化し→変わり]続けて…）"""
    i = 0
    while i < min(len(before), len(after)) and before[i] == after[i]:
        i += 1
    j = 0
    while j < min(len(before), len(after)) - i and before[-1 - j] == after[-1 - j]:
        j += 1
    head = ("…" if i > context else "") + before[max(0, i - context) : i]
    tail = before[len(before) - j : len(before) - j + context] + ("…" if j > context else "")
    return f"{head}[{before[i:len(before) - j]} → {after[i:len(after) - j]}]{tail}"


def load_edits(paths: list[Path]) -> list[dict]:
    edits = []
    for p in paths:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("format") == "gken-quiz-edits":
            items = data["edits"]
        elif isinstance(data, list):
            items = data
        else:
            sys.exit(f"{p}: 修正ファイルの形式ではありません")
        edits.extend(items)
    # 同じセルの修正は新しいものを優先
    latest: dict[str, dict] = {}
    for e in sorted(edits, key=lambda e: e.get("at", 0)):
        key = json.dumps([e["sheet"], e["key"], e["column"]], ensure_ascii=False, sort_keys=True)
        prev = latest.get(key)
        # 複数のファイルにまたがって同じセルを直した場合、最初の before を残す
        latest[key] = {**e, "before": prev["before"]} if prev else e
    return list(latest.values())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path, help="サイトから書き出した edits-*.json")
    ap.add_argument("--book", type=Path, default=BOOK, help="書き込む Excel（既定: G検定_用語集.xlsx）")
    ap.add_argument("--dry-run", action="store_true", help="書き込まずに結果だけ表示する")
    ap.add_argument("--force", action="store_true", help="Excel 側が変わっていても上書きする")
    args = ap.parse_args()

    lock = args.book.with_name("~$" + args.book.name)
    if lock.exists() and not args.dry_run:
        sys.exit(f"{args.book.name} が Excel で開かれています。閉じてから実行してください。")

    edits = load_edits(args.files)
    wb = openpyxl.load_workbook(args.book, rich_text=True)

    written, already, conflicts, errors = [], [], [], []
    for e in edits:
        sheet, column, key = e["sheet"], e["column"], e["key"]
        where = f"[{sheet}] {'・'.join(f'{k}={v}' for k, v in key.items())}「{column}」"
        if column not in EDITABLE.get(sheet, set()):
            errors.append(f"{where}: この列はサイトから直せません")
            continue
        ws = wb[sheet]
        header = {text_of(c.value): c.column for c in ws[1]}
        missing = [c for c in [column, *key] if c not in header]
        if missing:
            errors.append(f"{where}: 列 {missing} がありません")
            continue
        rows = [
            r
            for r in range(2, ws.max_row + 1)
            if all(text_of(ws.cell(r, header[k]).value) == text_of(v) for k, v in key.items())
        ]
        multi_ok = sheet == "穴埋め問題" and column == "穴あき解説文"
        if not rows or (len(rows) > 1 and not multi_ok):
            errors.append(f"{where}: 対象の行が {len(rows)} 行見つかりました（1行のはず）")
            continue

        before, after = text_of(e["before"]), text_of(e["after"])
        for r in rows:
            cell = ws.cell(r, header[column])
            current = text_of(cell.value)
            label = f"{where}（{r}行目）"
            if current == after:
                already.append(label)
                continue
            if current != before and not args.force:
                conflicts.append(f"{label}\n      直す前と今の Excel の違い: {short_diff(before, current)}\n      この修正:                 {short_diff(before, after)}")
                continue
            cell.value = with_same_font(cell.value, after)
            if sheet == "穴埋め問題" and column == "選択肢1" and "正解" in header:
                ans = ws.cell(r, header["正解"])
                ans.value = with_same_font(ans.value, after)
            written.append(f"{label}\n      {short_diff(current, after)}")

    print(f"修正 {len(edits)} 件（{', '.join(str(p.name) for p in args.files)}）")
    for title, items in [("書き込んだセル", written), ("反映済みのため飛ばしたセル", already), ("Excel 側が変わっているため飛ばしたセル（--force で上書き）", conflicts), ("エラー", errors)]:
        if items:
            print(f"\n■ {title}: {len(items)}")
            for it in items:
                print("  - " + it)

    if written and not args.dry_run:
        wb.save(args.book)
        print(f"\n{args.book.name} を保存しました。続けてチェック（npm run audit）を実行します。")
    elif args.dry_run:
        print("\n--dry-run のため保存していません。")
    else:
        print("\n書き込むセルはありませんでした。")
    return 1 if errors or conflicts else 0


if __name__ == "__main__":
    sys.exit(main())
