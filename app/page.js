"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/dashboard`
            : undefined,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card card">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>
          📋 班級成績追蹤系統
        </h1>
        <p className="helptext" style={{ marginBottom: "1.5rem" }}>
          輸入 Email,我們會寄一封登入連結給你。老師、學生、家長都用同一個入口。
        </p>

        {status === "sent" ? (
          <p>
            已寄出登入連結到 <b>{email}</b>,請到信箱點擊連結完成登入。
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="field"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" type="submit" disabled={status === "sending"}>
              {status === "sending" ? "寄送中…" : "取得登入連結"}
            </button>
            {status === "error" && <p className="error-text">{errorMsg}</p>}
          </form>
        )}

        <p className="helptext" style={{ marginTop: "1.5rem" }}>
          第一次使用嗎?請先請老師 / 管理員在 Supabase 後台把你的帳號加進
          <code> profiles </code> 表,並設定好角色(老師 / 學生 / 家長)。
        </p>
      </div>
    </div>
  );
}
