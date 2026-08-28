"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../../../lib/supabaseClient";

// 科目顯示順序跟顏色,沒列出來的科目會自動排在後面、隨機配色
const SUBJECT_ORDER = [
  "國文", "英文", "數學", "社會", "自然", "國際視野", "平均",
  "國文（模考原始分）", "自然（模考原始分）", "社會（模考原始分）",
  "英文（模考英閱）", "英文（模考英聽）",
  "數學（模考選擇題）", "數學（模考非選擇題）",
  "國文（模考量尺分數）", "自然（模考量尺分數）", "社會（模考量尺分數）",
  "數學（模考量尺分數）", "英文（模考量尺分數）",
  "寫作測驗級分", "寫作測驗加權分",
];

const SUBJECT_COLORS = {
  國文: "#2b3a55",
  英文: "#c0392b",
  數學: "#3f7d58",
  社會: "#c99a3a",
  自然: "#7a5ea8",
  國際視野: "#8a6d3b",
  平均: "#22252a",
};

const PALETTE = ["#2b3a55", "#c0392b", "#3f7d58", "#c99a3a", "#7a5ea8", "#8a6d3b", "#4a90a4", "#a15c8f"];

function colorFor(subj, idx) {
  return SUBJECT_COLORS[subj] || PALETTE[idx % PALETTE.length];
}

// 「量尺分數」這種 1-7 分的科目,跟 0-100 分的科目不能共用同一個 Y 軸刻度
function isLevelScaleSubject(subj) {
  return subj.includes("量尺分數") || subj.includes("寫作測驗級分");
}

function sortSubjects(subjects) {
  return [...subjects].sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a);
    const ib = SUBJECT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function StudentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [rows, setRows] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [activeSubjects, setActiveSubjects] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        router.replace("/");
        return;
      }
      const { data: stu } = await supabase.from("students").select("*, classes(name)").eq("id", id).single();
      setStudent(stu);

      const { data: scoreRows } = await supabase
        .from("scores")
        .select("subject, score, level_text, exams(name, order_index)")
        .eq("student_id", id);
      setRows(scoreRows || []);

      const { data: summary } = await supabase
        .from("exam_summary")
        .select("total_score, school_rank, class_rank, exams(name, order_index)")
        .eq("student_id", id);
      setSummaryRows(summary || []);

      const subjects = sortSubjects([...new Set((scoreRows || []).map((r) => r.subject))]);
      // 預設只勾選常用的幾科,避免第一次打開圖表太亂
      const defaultOn = subjects.filter((s) => ["國文", "英文", "數學", "社會", "自然", "平均"].includes(s));
      setActiveSubjects(defaultOn.length > 0 ? defaultOn : subjects.slice(0, 5));

      setLoading(false);
    }
    load();
  }, [id, router]);

  const allSubjects = useMemo(
    () => sortSubjects([...new Set(rows.map((r) => r.subject))]),
    [rows]
  );

  const chartData = useMemo(() => {
    const byExam = {};
    rows.forEach((r) => {
      const key = r.exams?.order_index ?? 0;
      const entry = byExam[key] || (byExam[key] = { exam: r.exams?.name, order: key });
      entry[r.subject] = r.score;
    });
    return Object.values(byExam).sort((a, b) => a.order - b.order);
  }, [rows]);

  const hasScoreScale = activeSubjects.some((s) => !isLevelScaleSubject(s));
  const hasLevelScale = activeSubjects.some((s) => isLevelScaleSubject(s));

  const latestLevels = useMemo(() => {
    const bySubject = {};
    rows
      .filter((r) => r.level_text)
      .forEach((r) => {
        const order = r.exams?.order_index ?? 0;
        const cur = bySubject[r.subject];
        if (!cur || order > cur.order) {
          bySubject[r.subject] = { level: r.level_text, examName: r.exams?.name, order };
        }
      });
    return bySubject;
  }, [rows]);

  // 完整成績總表:每次考試一列,每個科目一欄,後面加總分/校排名/班排名
  const summaryTable = useMemo(() => {
    const byExam = {};
    rows.forEach((r) => {
      const order = r.exams?.order_index ?? 0;
      const entry = byExam[order] || (byExam[order] = { order, examName: r.exams?.name, scores: {} });
      entry.scores[r.subject] = r.score;
    });
    summaryRows.forEach((r) => {
      const order = r.exams?.order_index ?? 0;
      const entry = byExam[order] || (byExam[order] = { order, examName: r.exams?.name, scores: {} });
      entry.total = r.total_score;
      entry.schoolRank = r.school_rank;
      entry.classRank = r.class_rank;
    });
    return Object.values(byExam).sort((a, b) => a.order - b.order);
  }, [rows, summaryRows]);

  const hasSummaryCols = summaryRows.length > 0;

  function toggleSubject(subj) {
    setActiveSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  }

  if (loading) return <div className="page">載入中…</div>;
  if (!student) return <div className="page">找不到這位學生。</div>;

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          📋 <span className="circle-mark">{student.name}</span> 的成績走勢
        </div>
        <a
          className="btn ghost"
          style={{ background: "transparent", color: "#fff", borderColor: "#fff" }}
          href={student.class_id ? `/class/${student.class_id}` : "/dashboard"}
        >
          返回班級
        </a>
      </div>
      <div className="page">
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <p className="helptext">
            {student.classes?.name} 班 · 座號 {student.seat_no}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {allSubjects.map((subj, idx) => {
              const color = colorFor(subj, idx);
              const on = activeSubjects.includes(subj);
              return (
                <button
                  key={subj}
                  className="btn ghost"
                  style={{
                    borderColor: color,
                    color: on ? "#fff" : color,
                    background: on ? color : "transparent",
                    fontSize: "0.85rem",
                    padding: "0.4rem 0.8rem",
                  }}
                  onClick={() => toggleSubject(subj)}
                >
                  {subj}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>各次考試分數走勢</h2>
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd6c4" />
              <XAxis
                dataKey="exam"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={90}
                tick={{ fontSize: 11 }}
              />
              {hasScoreScale && (
                <YAxis yAxisId="score" domain={[0, 100]} />
              )}
              {hasLevelScale && (
                <YAxis
                  yAxisId="level"
                  orientation="right"
                  domain={[0, 7]}
                  label={{ value: "等級量尺(1-7)", angle: 90, position: "insideRight", fontSize: 11 }}
                />
              )}
              <Tooltip />
              <Legend />
              {activeSubjects.map((subj, idx) => {
                const levelScale = isLevelScaleSubject(subj);
                return (
                  <Line
                    key={subj}
                    yAxisId={levelScale ? "level" : "score"}
                    type="monotone"
                    dataKey={subj}
                    stroke={colorFor(subj, idx)}
                    strokeWidth={subj === "平均" ? 3 : 2}
                    strokeDasharray={levelScale ? "5 3" : undefined}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <p className="helptext" style={{ marginTop: "0.75rem" }}>
            提示:點選上方科目按鈕可以切換要看哪幾科的走勢。虛線、右邊刻度是模擬考的「能力等級量尺」(1-7分,7分最好),
            跟左邊 0-100 分的一般分數不是同一個尺度,分開看才不會誤判。
          </p>
        </div>

        {Object.keys(latestLevels).length > 0 && (
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ marginTop: 0 }}>最近一次能力等級(參考資訊)</h2>
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              {Object.entries(latestLevels).map(([subj, info]) => (
                <span
                  key={subj}
                  className="badge mid"
                  title={`來自:${info.examName}`}
                  style={{ background: "#f1ecdd" }}
                >
                  {subj}：{info.level}
                </span>
              ))}
            </div>
            <p className="helptext" style={{ marginTop: "0.75rem" }}>
              能力等級標示(如 A++、B+)僅供參考,不影響走勢圖的分數計算。想看等級「隨時間變化」的趨勢,
              可以到上面走勢圖勾選「量尺分數」那幾科,會用虛線畫在右邊的 1-7 分刻度上。
            </p>
          </div>
        )}

        <div className="card">
          <h2 style={{ marginTop: 0 }}>成績總表</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="roster">
              <thead>
                <tr>
                  <th>考試</th>
                  {allSubjects.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  {hasSummaryCols && (
                    <>
                      <th>總分</th>
                      <th>校/年排名</th>
                      <th>班排名</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {summaryTable.map((row) => (
                  <tr key={row.order}>
                    <td className="mono">{row.examName}</td>
                    {allSubjects.map((s) => (
                      <td key={s} className="mono">
                        {row.scores[s] ?? "—"}
                      </td>
                    ))}
                    {hasSummaryCols && (
                      <>
                        <td className="mono">{row.total ?? "—"}</td>
                        <td className="mono">{row.schoolRank ?? "—"}</td>
                        <td className="mono">{row.classRank ?? "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="helptext" style={{ marginTop: "0.75rem" }}>
            這是這位學生所有已匯入考試的完整成績,「—」代表這次考試沒有這個科目的資料。
          </p>
        </div>
      </div>
    </div>
  );
}
