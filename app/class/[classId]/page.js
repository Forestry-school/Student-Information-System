"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import {
  CORE_SUBJECTS,
  TIER_LABELS,
  TREND_LABELS,
  groupByLatestAverage,
  groupBySubject,
  groupByTrend,
} from "../../../lib/grouping";

export default function ClassPage() {
  const { classId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState("");
  const [students, setStudents] = useState([]);
  const [scoresByStudent, setScoresByStudent] = useState({});
  const [mode, setMode] = useState("average"); // average | subject | trend
  const [subject, setSubject] = useState("國文");

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user) {
        router.replace("/");
        return;
      }

      const { data: cls } = await supabase.from("classes").select("*").eq("id", classId).single();
      setClassName(cls?.name || "");

      const { data: studs } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", classId)
        .order("seat_no");
      setStudents(studs || []);

      const ids = (studs || []).map((s) => s.id);
      if (ids.length > 0) {
        const { data: rows } = await supabase
          .from("scores")
          .select("student_id, subject, score, exams(order_index)")
          .in("student_id", ids);

        const grouped = {};
        (rows || []).forEach((r) => {
          const list = grouped[r.student_id] || (grouped[r.student_id] = []);
          list.push({ subject: r.subject, score: r.score, exam_order: r.exams?.order_index ?? 0 });
        });
        setScoresByStudent(grouped);
      }
      setLoading(false);
    }
    load();
  }, [classId, router]);

  const tierMap = useMemo(() => {
    if (mode === "average") return groupByLatestAverage(students, scoresByStudent);
    if (mode === "subject") return groupBySubject(students, scoresByStudent, subject);
    if (mode === "trend") return groupByTrend(students, scoresByStudent);
    return new Map();
  }, [mode, subject, students, scoresByStudent]);

  const labels = mode === "trend" ? TREND_LABELS : TIER_LABELS;

  if (loading) return <div className="page">載入中…</div>;

  return (
    <div>
      <div className="topbar">
        <div className="brand">📋 {className} 班成績總覽</div>
        <a className="btn ghost" style={{ background: "transparent", color: "#fff", borderColor: "#fff" }} href="/dashboard">
          返回班級列表
        </a>
      </div>
      <div className="page">
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>差異化分群方式</h2>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <select className="tier-select" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="average">最近一次段考總平均</option>
              <option value="subject">單科最近成績</option>
              <option value="trend">整體趨勢(進步/持平/退步)</option>
            </select>
            {mode === "subject" && (
              <select className="tier-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {CORE_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="helptext" style={{ marginTop: "0.75rem" }}>
            {mode === "average" && "依最近一次段考的科目平均分數,把班上分成高分群 / 中分群 / 待加強三組,約各佔三分之一人數。"}
            {mode === "subject" && `依「${subject}」最近一次成績分群,方便針對這一科做加深加廣或補救教學。`}
            {mode === "trend" && "用每位學生最近幾次段考「平均」成績的走勢斜率判斷:持續進步、大致持平、還是明顯退步。"}
          </p>
        </div>

        <div className="card">
          <table className="roster">
            <thead>
              <tr>
                <th>座號</th>
                <th>姓名</th>
                <th>分群</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const tier = tierMap.get(s);
                return (
                  <tr key={s.id}>
                    <td className="mono">{s.seat_no}</td>
                    <td>{s.name}</td>
                    <td>
                      {tier ? (
                        <span className={`badge ${tier}`}>{labels[tier]}</span>
                      ) : (
                        <span className="helptext">尚無足夠資料</span>
                      )}
                    </td>
                    <td>
                      <a className="btn ghost" href={`/student/${s.id}`}>
                        查看走勢 →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
