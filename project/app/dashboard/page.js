"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [classes, setClasses] = useState([]);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        router.replace("/");
        return;
      }
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profErr || !prof) {
        setError(
          "找不到你的角色設定,請請老師 / 管理員到 Supabase 後台的 profiles 表,把你的帳號加進去並指定角色。"
        );
        setLoading(false);
        return;
      }
      setProfile(prof);

      if (prof.role === "teacher") {
        const { data: cls } = await supabase.from("classes").select("*").order("name");
        setClasses(cls || []);
        setLoading(false);
      } else if (prof.student_id) {
        router.replace(`/student/${prof.student_id}`);
      } else {
        setError("你的帳號還沒有綁定學生資料,請聯絡老師。");
        setLoading(false);
      }
    }
    load();
  }, [router]);

  if (loading) return <div className="page">載入中…</div>;
  if (error)
    return (
      <div className="page">
        <div className="card error-text">{error}</div>
      </div>
    );

  return (
    <div>
      <div className="topbar">
        <div className="brand">📋 班級成績追蹤系統</div>
        <button
          className="btn ghost"
          style={{ background: "transparent", color: "#fff", borderColor: "#fff" }}
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/");
          }}
        >
          登出
        </button>
      </div>
      <div className="page">
        <h1>選擇班級</h1>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
          {classes.map((c) => (
            <a key={c.id} className="card" href={`/class/${c.id}`} style={{ textDecoration: "none" }}>
              <h2 style={{ margin: 0 }}>{c.name} 班</h2>
              <p className="helptext">點擊查看班級成績與分群</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
