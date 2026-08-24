import "./globals.css";

export const metadata = {
  title: "班級成績追蹤系統",
  description: "個別學生成績走勢與差異化分群",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
