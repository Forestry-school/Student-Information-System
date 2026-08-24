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
import { CORE_SUBJECTS } from "../../../lib/grouping";

const SUBJECT_COLORS = {
  國文: "#2b3a55",
  英文: "#c0392b",
  英語: "#c0392b",
  數學: "#3f7d58",
  社會: "#c99a3a",
  自然: "#7a5ea8",
  平均: "#22252a",
};

export default function StudentPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [rows, setRows] = useState([]);
  const [activeSubjects, setActiveSubjects] = useState(["國文", "英文", "數學", "社會", "自然"]);

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
      setLoading(false);
    }
    load();
  }, [id, router]);

  const chartData = useMemo(() => {
    const byExam = {};
    rows.forEach((r) => {
      const key = r.exams?.order_index ?? 0;
      const entry = byExam[key] || (byExam[key] = { exam: r.exams?.name, order: key });
      entry[r.subject] = r.score;
    });
    return Object.values(byExam).sort((a, b) => a.order - b.order);
  }, [rows]);

  const latestLevels = useMemo(() => {
    // 每一科最近一次有「能力等級」的紀錄
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
            {[...CORE_SUBJECTS, "平均"].map((subj) => (
              <button
                key={subj}
                className="btn ghost"
                style={{
                  borderColor: SUBJECT_COLORS[subj],
                  color: activeSubjects.includes(subj) ? "#fff" : SUBJECT_COLORS[subj],
                  background: activeSubjects.includes(subj) ? SUBJECT_COLORS[subj] : "transparent",
                }}
                onClick={() => toggleSubject(subj)}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>各次段考分數走勢</h2>
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
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              {activeSubjects.map((subj) => (
                <Line
                  key={subj}
                  type="monotone"
                  dataKey={subj}
                  stroke={SUBJECT_COLORS[subj] || "#888"}
                  strokeWidth={subj === "平均" ? 3 : 2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="helptext" style={{ marginTop: "0.75rem" }}>
            提示:點選上方科目按鈕可以切換要看哪幾科的走勢,平均線用粗黑線標示,方便快速看出整體高低起伏。
          </p>
        </div>

        {Object.keys(latestLevels).length > 0 && (
          <div className="card">
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
              這是模擬考的能力等級標示(如 A++、B+),僅供參考,不影響上方走勢圖的分數計算。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
