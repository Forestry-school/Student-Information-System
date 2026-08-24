#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模擬考成績匯入工具 v2(教育會考模擬考格式專用)
------------------------------------------------
對應欄位格式:

  班級,座號,姓名,
  國文,能力,標示,分數,
  自然,能力,標示,分數,
  社會,能力,標示,分數,
  數學,非選,總分,能力,標示,分數,
  英閱,英聽,總分,能力,標示,分數,
  寫作測驗,分數,
  總分,班級名,校排名

★ 這一版改成用「姓名」比對學生,不用班級+座號比對:
  - 班級每年會改名(例如 801→901),學生升年級不用做額外的班級改名 SQL,
    這支腳本會自動幫忙更新學生目前的班級/座號。
  - 如果姓名在資料庫裡還找不到,會當成新生(轉入生)自動新增一筆學生資料。
  - 注意:如果班上有兩個學生姓名完全相同,比對可能會抓錯人,
    請務必檢查一下(這種情況很少見,但腳本沒辦法自動分辨)。

★ 這一版保留 Excel 裡所有欄位,不會省略任何資料:
  - 國文/自然/社會:存「原始得分」+「能力／標示」+「量尺分數(1-7)」
  - 數學:存「選擇題得分」「非選擇題得分」「換算總分(百分制)」+「能力／標示」+「量尺分數」
  - 英文:存「英閱得分」「英聽得分」「換算總分(百分制)」+「能力／標示」+「量尺分數」
  - 寫作測驗:存「級分」+「加權分數」
  - 整份考卷:存「總分(5科量尺加總+寫作加權)」「校排名」「班排名」(對應「班級名」欄位,如果這欄位其實
    是別的意思,請告訴我再調整)

用法:
  python3 import_mock_exam.py \
      --xlsx 9年級模模考.xlsx \
      --exam "114學年下學期第一次模擬考" \
      --period "九年級下學期" \
      --order-index 20 \
      --out 這次模擬考.sql

需要先安裝:pip install pandas openpyxl
"""

import argparse
import sys

import pandas as pd

EXPECTED_HEADERS = [
    "班級", "座號", "姓名",
    "國文", "能力", "標示", "分數",
    "自然", "能力", "標示", "分數",
    "社會", "能力", "標示", "分數",
    "數學", "非選", "總分", "能力", "標示", "分數",
    "英閱", "英聽", "總分", "能力", "標示", "分數",
    "寫作測驗", "分數", "總分",
    "班級名", "校排名",
]


def esc(s):
    return str(s).replace("'", "''")


def clean_num(v):
    if pd.isna(v):
        return None
    return float(v)


def level(ability, mark):
    """把「能力」跟「標示」合併存成一個文字,例如 '基礎／B'"""
    parts = []
    if pd.notna(ability):
        parts.append(str(ability).strip())
    if pd.notna(mark):
        parts.append(str(mark).strip())
    return "／".join(parts) if parts else None


def main():
    parser = argparse.ArgumentParser(description="產生模擬考成績的匯入 SQL(依姓名比對學生)")
    parser.add_argument("--xlsx", required=True, help="模擬考 Excel 檔路徑")
    parser.add_argument("--sheet", default=0, help="工作表名稱或索引(預設第一個)")
    parser.add_argument("--exam", required=True, help="考試名稱,例如 114下學期第一次模擬考")
    parser.add_argument("--period", required=True, help="學期名稱,例如 九年級下學期")
    parser.add_argument("--order-index", required=True, type=int, help="時間排序數字")
    parser.add_argument("--out", required=True, help="輸出的 SQL 檔名")
    args = parser.parse_args()

    raw = pd.read_excel(args.xlsx, sheet_name=args.sheet, header=None)
    header_row = [str(x).strip() if pd.notna(x) else "" for x in raw.iloc[0].tolist()[: len(EXPECTED_HEADERS)]]

    if header_row != EXPECTED_HEADERS:
        print("⚠️  警告:這份檔案的欄位跟預期的模擬考格式不完全一樣,匯入結果可能會對錯欄位。")
        print("預期欄位:", EXPECTED_HEADERS)
        print("實際欄位:", header_row)
        answer = input("要不要仍然繼續匯入?(y/N): ").strip().lower()
        if answer != "y":
            sys.exit(1)

    classes_needed = set()
    student_upserts = []   # (class, seat_no, name)
    score_rows = []
    summary_rows = []
    n_students = 0

    for i in range(1, raw.shape[0]):
        row = raw.iloc[i]
        cls, seat_no, name = row[0], row[1], row[2]
        if pd.isna(cls) or pd.isna(seat_no) or pd.isna(name):
            continue
        cls = str(cls).strip()
        seat_no = str(seat_no).strip()
        name = str(name).strip()
        classes_needed.add(cls)
        student_upserts.append((cls, seat_no, name))
        n_students += 1

        def student_ref(name=name):
            return f"(select id from students where name='{esc(name)}' order by id limit 1)"

        def add_score(subject, score_val, level_val=None):
            score = clean_num(score_val)
            if score is None:
                return
            level_sql = f"'{esc(level_val)}'" if level_val else "null"
            score_rows.append(
                f"({student_ref()}, "
                f"(select id from exams where name='{esc(args.exam)}'), "
                f"'{esc(subject)}', {score}, {level_sql})"
            )

        # 國文 / 自然 / 社會:原始得分(不是百分制)+ 能力／標示 + 量尺分數(1-7)
        add_score("國文（模考原始分）", row[3], level(row[4], row[5]))
        add_score("國文（模考量尺分數）", row[6])
        add_score("自然（模考原始分）", row[7], level(row[8], row[9]))
        add_score("自然（模考量尺分數）", row[10])
        add_score("社會（模考原始分）", row[11], level(row[12], row[13]))
        add_score("社會（模考量尺分數）", row[14])

        # 數學:選擇題 / 非選擇題 / 換算總分(百分制,跟段考同基準)+ 能力／標示 + 量尺分數
        add_score("數學（模考選擇題）", row[15])
        add_score("數學（模考非選擇題）", row[16])
        add_score("數學", row[17], level(row[18], row[19]))
        add_score("數學（模考量尺分數）", row[20])

        # 英文:英閱 / 英聽 / 換算總分(百分制,跟段考同基準)+ 能力／標示 + 量尺分數
        add_score("英文（模考英閱）", row[21])
        add_score("英文（模考英聽）", row[22])
        add_score("英文", row[23], level(row[24], row[25]))
        add_score("英文（模考量尺分數）", row[26])

        # 寫作測驗:級分 + 加權分數
        add_score("寫作測驗級分", row[27])
        add_score("寫作測驗加權分", row[28])

        # 整份考卷總分與排名
        total_score = clean_num(row[29])
        class_rank_raw = row[30]   # 原欄名「班級名」,依老師說明視為班排名
        school_rank_raw = row[31]
        if total_score is not None or pd.notna(class_rank_raw) or pd.notna(school_rank_raw):
            class_rank_sql = int(class_rank_raw) if pd.notna(class_rank_raw) else "null"
            school_rank_sql = int(school_rank_raw) if pd.notna(school_rank_raw) else "null"
            total_score_sql = total_score if total_score is not None else "null"
            summary_rows.append(
                f"({student_ref()}, "
                f"(select id from exams where name='{esc(args.exam)}'), "
                f"{total_score_sql}, {school_rank_sql}, {class_rank_sql})"
            )

    if n_students == 0:
        print("錯誤:沒有讀到任何學生資料,請確認檔案內容。")
        sys.exit(1)

    lines = []
    lines.append(f"-- 匯入模擬考:{args.exam}（{args.period}）\n")

    # 1) 確保班級存在
    lines.append("-- 確保班級存在")
    for c in sorted(classes_needed):
        lines.append(f"insert into classes (name) values ('{esc(c)}') on conflict (name) do nothing;")
    lines.append("")

    # 2) 依姓名 upsert 學生(更新既有學生的班級/座號,姓名找不到的當新生新增)
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

    # 3) 考試
    lines.append(
        f"insert into exams (name, period, order_index) values "
        f"('{esc(args.exam)}', '{esc(args.period)}', {args.order_index})\n"
        f"on conflict (name) do nothing;\n"
    )

    # 4) 成績
    lines.append("insert into scores (student_id, exam_id, subject, score, level_text) values")
    lines.append(",\n".join(score_rows))
    lines.append(
        "on conflict (student_id, exam_id, subject) do update "
        "set score = excluded.score, level_text = excluded.level_text;\n"
    )

    # 5) 總分與排名
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

    print(f"完成！已產生 {args.out}，內含 {n_students} 位學生的模擬考成績。")
    print("接下來：打開 Supabase → SQL Editor，貼上這個檔案的內容並執行即可。")


if __name__ == "__main__":
    main()
