#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
段考 / 期中考 / 期末考 成績匯入工具
------------------------------------------------
對應欄位格式(跟模擬考工具一樣,直接讀 Excel,不用先轉 CSV):

  班級,座號,姓名,國語文,英語文,數學,社會,自然,[國際視野],總分,總平均,班名次,年名次

  - 「國際視野」是選填欄位,檔案裡有就存,沒有就跳過,不影響其他資料。
  - 欄位名稱只要跟上面「意思一樣」就會被抓到(國語文/國文都算國文、英語文/英文都算英文),
    大小寫、順序不用完全一致,但欄位名稱本身要在下面 COLUMN_ALIASES 裡對得上。

★ 跟模擬考工具一樣,用「姓名」比對學生,不是用班級+座號:
  - 班級每年改名(例如 801→901)不用額外處理,工具會自動更新該學生目前的班級/座號
  - 名字找不到就當新生自動新增
  - 如果班上有兩個學生姓名完全相同,比對可能會抓錯人,請匯入後抽查

★ 存法:
  - 國文/英文/數學/社會/自然/國際視野 → scores 表,科目名稱統一存成「國文」「英文」...(不管原本欄位叫國語文或英語文)
  - 總平均 → scores 表,科目存成「平均」(沿用舊資料的命名方式,走勢圖會接續原本的平均線)
  - 總分、班名次、年名次 → exam_summary 表(年名次存進 school_rank 欄位、班名次存進 class_rank 欄位)

用法:
  python3 import_regular_exam.py \
      --xlsx 114上期中考.xlsx \
      --exam "114學年上學期期中考" \
      --period "八年級上學期" \
      --order-index 15 \
      --out 這次考試.sql

需要先安裝:pip install pandas openpyxl
"""

import argparse
import sys

import pandas as pd

# 欄位名稱對照:遇到左邊任一名稱,就當作右邊的科目
SUBJECT_ALIASES = {
    "國語文": "國文", "國文": "國文",
    "英語文": "英文", "英文": "英文",
    "數學": "數學",
    "社會": "社會",
    "自然": "自然",
    "國際視野": "國際視野",
}
AVERAGE_ALIASES = ["總平均", "平均"]
TOTAL_ALIASES = ["總分"]
CLASS_RANK_ALIASES = ["班名次", "班排名"]
GRADE_RANK_ALIASES = ["年名次", "校排名", "全年級名次"]


def esc(s):
    return str(s).replace("'", "''")


def clean_num(v):
    if pd.isna(v):
        return None
    return float(v)


def find_col(columns, aliases):
    for a in aliases:
        if a in columns:
            return a
    return None


def main():
    parser = argparse.ArgumentParser(description="產生段考/期中/期末考成績的匯入 SQL(依姓名比對學生)")
    parser.add_argument("--xlsx", required=True, help="成績 Excel 檔路徑")
    parser.add_argument("--sheet", default=0, help="工作表名稱或索引(預設第一個)")
    parser.add_argument("--exam", required=True, help="考試名稱,例如 114上學期期中考")
    parser.add_argument("--period", required=True, help="學期名稱,例如 八年級上學期")
    parser.add_argument("--order-index", required=True, type=int, help="時間排序數字")
    parser.add_argument("--out", required=True, help="輸出的 SQL 檔名")
    args = parser.parse_args()

    df = pd.read_excel(args.xlsx, sheet_name=args.sheet, header=0)
    df.columns = [str(c).strip() for c in df.columns]

    required = {"班級", "座號", "姓名"}
    if not required.issubset(set(df.columns)):
        print(f"錯誤:找不到必要欄位 {required},目前欄位是 {df.columns.tolist()}")
        sys.exit(1)

    subject_cols = {alias: canon for alias, canon in SUBJECT_ALIASES.items() if alias in df.columns}
    if not subject_cols:
        print("錯誤:找不到任何科目欄位(國語文/英語文/數學/社會/自然),請確認欄位名稱。")
        sys.exit(1)

    avg_col = find_col(df.columns, AVERAGE_ALIASES)
    total_col = find_col(df.columns, TOTAL_ALIASES)
    class_rank_col = find_col(df.columns, CLASS_RANK_ALIASES)
    grade_rank_col = find_col(df.columns, GRADE_RANK_ALIASES)

    print(f"抓到的科目欄位:{list(subject_cols.keys())} → {list(subject_cols.values())}")
    print(f"總平均欄位:{avg_col}　總分欄位:{total_col}　班名次:{class_rank_col}　年名次:{grade_rank_col}")

    classes_needed = set()
    student_upserts = []
    score_rows = []
    summary_rows = []
    n_students = 0

    for _, row in df.iterrows():
        cls, seat_no, name = row.get("班級"), row.get("座號"), row.get("姓名")
        if pd.isna(cls) or pd.isna(seat_no) or pd.isna(name):
            continue
        cls = str(cls).strip()
        seat_no = str(seat_no).strip()
        name = str(name).strip()
        classes_needed.add(cls)
        student_upserts.append((cls, seat_no, name))
        n_students += 1

        student_ref = f"(select id from students where name='{esc(name)}' order by id limit 1)"

        for alias, canon in subject_cols.items():
            score = clean_num(row.get(alias))
            if score is None:
                continue
            score_rows.append(
                f"({student_ref}, (select id from exams where name='{esc(args.exam)}'), "
                f"'{esc(canon)}', {score}, null)"
            )

        if avg_col:
            avg = clean_num(row.get(avg_col))
            if avg is not None:
                score_rows.append(
                    f"({student_ref}, (select id from exams where name='{esc(args.exam)}'), "
                    f"'平均', {avg}, null)"
                )

        total_score = clean_num(row.get(total_col)) if total_col else None
        class_rank = row.get(class_rank_col) if class_rank_col else None
        grade_rank = row.get(grade_rank_col) if grade_rank_col else None
        if total_score is not None or pd.notna(class_rank) or pd.notna(grade_rank):
            class_rank_sql = int(class_rank) if pd.notna(class_rank) else "null"
            grade_rank_sql = int(grade_rank) if pd.notna(grade_rank) else "null"
            total_score_sql = total_score if total_score is not None else "null"
            summary_rows.append(
                f"({student_ref}, (select id from exams where name='{esc(args.exam)}'), "
                f"{total_score_sql}, {grade_rank_sql}, {class_rank_sql})"
            )

    if n_students == 0:
        print("錯誤:沒有讀到任何學生資料,請確認檔案內容。")
        sys.exit(1)

    lines = [f"-- 匯入考試:{args.exam}（{args.period}）\n"]

    lines.append("-- 確保班級存在")
    for c in sorted(classes_needed):
        lines.append(f"insert into classes (name) values ('{esc(c)}') on conflict (name) do nothing;")
    lines.append("")

    lines.append("-- 依姓名比對學生:找得到就更新班級/座號,找不到就當新生新增")
    for cls, seat_no, name in student_upserts:
        lines.append(
            f"update students set class_id=(select id from classes where name='{esc(cls)}'), "
            f"seat_no='{esc(seat_no)}' where name='{esc(name)}';"
        )
        lines.append(
            f"insert into students (class_id, seat_no, name) "
            f"select (select id from classes where name='{esc(cls)}'), '{esc(seat_no)}', '{esc(name)}' "
            f"where not exists (select 1 from students where name='{esc(name)}');"
        )
    lines.append("")

    lines.append(
        f"insert into exams (name, period, order_index) values "
        f"('{esc(args.exam)}', '{esc(args.period)}', {args.order_index})\n"
        f"on conflict (name) do nothing;\n"
    )

    lines.append("insert into scores (student_id, exam_id, subject, score, level_text) values")
    lines.append(",\n".join(score_rows))
    lines.append(
        "on conflict (student_id, exam_id, subject) do update "
        "set score = excluded.score, level_text = excluded.level_text;\n"
    )

    if summary_rows:
        lines.append("insert into exam_summary (student_id, exam_id, total_score, school_rank, class_rank) values")
        lines.append(",\n".join(summary_rows))
        lines.append(
            "on conflict (student_id, exam_id) do update "
            "set total_score = excluded.total_score, school_rank = excluded.school_rank, "
            "class_rank = excluded.class_rank;\n"
        )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"完成！已產生 {args.out}，內含 {n_students} 位學生的成績。")
    print("接下來：打開 Supabase → SQL Editor，貼上這個檔案的內容並執行即可。")


if __name__ == "__main__":
    main()
