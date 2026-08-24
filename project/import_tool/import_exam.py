#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新考試成績匯入工具
-------------------
把一份「班級,座號,姓名,科目,分數」格式的 CSV(見 template.csv),
轉成可以直接貼到 Supabase SQL Editor 執行的 SQL。

用法範例:

  python3 import_exam.py \
      --csv 114上期中考.csv \
      --exam "114學年上學期期中考" \
      --period "八年級上學期" \
      --order-index 15 \
      --out 114上期中考.sql

參數說明:
  --csv           你填好的成績 CSV 檔(欄位:班級,座號,姓名,科目,分數)
  --exam          這次考試的名稱,例如「114上學期期中考」「114上學期模擬考」
                  注意:同一個名字只能用一次(exams.name 是唯一值),
                  如果不同班期中考範圍/時間不同,建議名稱要能區分開來。
  --period        這次考試屬於哪個學期,例如「八年級上學期」(純備註用,不影響排序)
  --order-index   這次考試在時間軸上排第幾個(數字越大越晚)。
                  可以打開 Supabase 的 exams 表,看目前最大的 order_index 是多少,
                  新考試就填「目前最大值 + 1」。
  --out           輸出的 SQL 檔名

腳本會自動做的事:
  - 如果 CSV 裡沒有填「平均」這個科目,會自動用國文/英文/數學/社會/自然
    5 科的平均幫你算好一併存入(這樣差異化分群功能才抓得到資料)。
"""

import argparse
import csv
import sys
from collections import defaultdict

CORE_SUBJECTS = ["國文", "英文", "數學", "社會", "自然"]


def esc(s):
    return str(s).replace("'", "''")


def main():
    parser = argparse.ArgumentParser(description="產生新考試成績的匯入 SQL")
    parser.add_argument("--csv", required=True, help="輸入的成績 CSV 檔路徑")
    parser.add_argument("--exam", required=True, help="考試名稱,例如 114上學期期中考")
    parser.add_argument("--period", required=True, help="學期名稱,例如 八年級上學期")
    parser.add_argument("--order-index", required=True, type=int, help="時間排序數字")
    parser.add_argument("--out", required=True, help="輸出的 SQL 檔名")
    args = parser.parse_args()

    # 讀取 CSV,依 (班級,座號,姓名) 分組
    students = defaultdict(dict)  # (class, seat_no, name) -> {subject: score}
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required_cols = {"班級", "座號", "姓名", "科目", "分數"}
        if not required_cols.issubset(set(reader.fieldnames or [])):
            print(f"錯誤:CSV 欄位必須包含 {required_cols},目前是 {reader.fieldnames}")
            sys.exit(1)
        for row in reader:
            key = (row["班級"].strip(), row["座號"].strip(), row["姓名"].strip())
            subj = row["科目"].strip()
            score = row["分數"].strip()
            if score == "":
                continue
            students[key][subj] = float(score)

    if not students:
        print("錯誤:CSV 裡沒有讀到任何資料,請確認格式。")
        sys.exit(1)

    # 自動補「平均」(如果 CSV 沒有給)
    for key, subj_scores in students.items():
        if "平均" not in subj_scores:
            core_vals = [subj_scores[s] for s in CORE_SUBJECTS if s in subj_scores]
            if core_vals:
                subj_scores["平均"] = round(sum(core_vals) / len(core_vals), 2)

    lines = []
    lines.append(f"-- 匯入考試:{args.exam}（{args.period}）\n")
    lines.append(
        f"insert into exams (name, period, order_index) values "
        f"('{esc(args.exam)}', '{esc(args.period)}', {args.order_index})\n"
        f"on conflict (name) do nothing;\n"
    )

    score_rows = []
    for (cls, seat_no, name), subj_scores in students.items():
        for subj, score in subj_scores.items():
            score_rows.append(
                f"((select id from students s join classes c on s.class_id=c.id "
                f"where c.name='{esc(cls)}' and s.seat_no='{esc(seat_no)}'), "
                f"(select id from exams where name='{esc(args.exam)}'), "
                f"'{esc(subj)}', {score})"
            )

    lines.append("insert into scores (student_id, exam_id, subject, score) values")
    lines.append(",\n".join(score_rows))
    lines.append("on conflict (student_id, exam_id, subject) do update set score = excluded.score;\n")

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"完成！已產生 {args.out}，內含 {len(students)} 位學生、共 {len(score_rows)} 筆成績。")
    print("接下來：打開 Supabase → SQL Editor，貼上這個檔案的內容並執行即可。")


if __name__ == "__main__":
    main()
