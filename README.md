# 班級成績追蹤系統

依你上傳的《113學年度入學國中生.xlsx》建立的成績追蹤網站,包含:

- 📈 **個別學生成績走勢圖**:選一位學生,看他從入學成績到最近一次段考,各科分數的折線走勢
- 🎯 **差異化分群**:老師可在班級頁面選擇「最近總平均 / 單科成績 / 整體趨勢」三種方式,自動把學生分成高分群、中分群、待加強
- 🔐 **角色登入**:老師看得到全班,學生/家長只看得到自己(孩子)的成績(用 Supabase Row Level Security 做權限控管)

技術:Next.js(前端)＋ Supabase(資料庫 + 登入)＋ Vercel(部署)＋ Recharts(圖表)。全部**免費額度內**就能跑起來。

---

## 一、建立 Supabase 專案(資料庫)

1. 到 [supabase.com](https://supabase.com) 免費註冊、建立一個新專案(New Project)。
2. 專案建立好後,左側選單點 **SQL Editor** → New query。
3. 打開這個資料夾裡的 `supabase/schema.sql`,整個複製貼上,按 **Run**。這會建立好所有資料表跟權限規則,資料庫是全空的,沒有預先塞入任何班級、學生或成績。
4. 左側選單 **Project Settings → API**,把 **Project URL** 和 **anon public key** 記下來,等一下會用到。

之後所有的班級、學生、成績,都用 `import_tool/` 資料夾裡的工具匯入(見第六節)——第一次匯入任何一份段考或模擬考 Excel 時,工具會自動把檔案裡的班級和學生建立起來,不用另外手動建學生名單。

## 二、設定登入帳號與角色

網站用「Email 登入連結」(不用記密碼)。要讓老師/學生/家長能登入,要做兩件事:

1. **Supabase 後台 → Authentication → Users → Add user**,用他們的 Email 建立帳號(可以先用「Auto Confirm User」,不用等他們自己收信驗證)。
2. **Table Editor → profiles**,新增一列:
   - `id`:剛剛建立的使用者 UUID(在 Authentication → Users 列表可以複製)
   - `role`:`teacher`(老師)、`student`(學生)或 `parent`(家長)
   - `student_id`:如果是學生或家長,填上對應的學生 id(可以到 `students` 表查詢座號姓名對應的 id;老師不用填)
   - `display_name`:顯示名稱(選填)

> 之後每學期新增學生或帳號,都用同樣方式在 `students` 和 `profiles` 兩張表加資料即可。

## 三、把程式碼放上 GitHub

```bash
cd class-grade-tracker   # 這個資料夾
git init
git add .
git commit -m "初始版本:班級成績追蹤系統"
```

到 GitHub 建立一個新的 repository(可以設為 Private,因為裡面會有學生成績),然後:

```bash
git remote add origin https://github.com/你的帳號/你的repo.git
git branch -M main
git push -u origin main
```

## 四、部署到 Vercel

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入。
2. **Add New → Project**,選剛剛建立的 repository。
3. 在 **Environment Variables** 加兩個變數(從第一步 Supabase API 設定頁複製):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 按 **Deploy**,等一兩分鐘完成後就會拿到一個 `xxx.vercel.app` 網址,老師、學生、家長都可以直接用這個網址登入。

## 五、本機測試(選用)

如果想先在自己電腦上跑起來看看:

```bash
npm install
cp .env.local.example .env.local   # 填入你的 Supabase URL 和 anon key
npm run dev
```

打開 http://localhost:3000 即可。

## 六、以後怎麼匯入新考試成績(段考/期中考/期末考/模擬考通用)

不管是哪一種考試,流程都一樣,用 `import_tool/` 資料夾裡的工具:

### 段考 / 期中考 / 期末考(用 import_regular_exam.py)

直接拿學校匯出的 Excel 匯入,欄位只要有「班級、座號、姓名、國語文（或國文）、英語文（或英文）、數學、社會、自然」就可以,總分/總平均/班名次/年名次有的話也會一起存:

```bash
cd import_tool
python3 import_regular_exam.py \
  --xlsx 114上期中考.xlsx \
  --exam "114學年上學期期中考" \
  --period "八年級上學期" \
  --order-index 15 \
  --out 這次考試.sql
```

跟模擬考工具一樣**用姓名比對學生**,班級改名、轉學生轉入生都不用額外處理。存法:
- 國語文/英語文/數學/社會/自然 → 統一存成「國文」「英文」「數學」「社會」「自然」,跟歷史資料接續同一條線
- 總平均 → 存成「平均」,跟歷史資料的平均線接續
- 總分、班名次、年名次 → 存進 `exam_summary`(年名次存在 school_rank 欄位、班名次存在 class_rank 欄位)

如果你的檔案還有「國際視野」欄位,工具也會自動抓到一起存,不用另外處理。

> 舊版的 `import_exam.py`(手填 CSV 用)還留著,如果哪次沒有現成 Excel、想手動輸入少數幾筆成績,還是可以用它,但**它是用班級+座號比對**,班級改名時要留意。往後只要有 Excel 檔案,都建議優先用 `import_regular_exam.py`。

### 模擬考(用 import_mock_exam.py)

模擬考的成績單格式比較複雜,直接拿學校/補習班給的模擬考 Excel 匯入:

```bash
cd import_tool
python3 import_mock_exam.py \
  --xlsx 模擬考檔案.xlsx \
  --exam "114學年下學期第一次模擬考" \
  --period "九年級下學期" \
  --order-index 20 \
  --out 這次模擬考.sql
```

這一版工具改成**用姓名比對學生**,不是用班級+座號:
- 班級每年會改名(例如 801→901)完全不用理它,工具會自動幫每位學生更新目前的班級/座號
- 名字如果資料庫裡找不到,會自動當成轉入的新生新增一筆
- Excel 裡的每一個欄位都會完整保留,不會省略:國文/自然/社會的原始分+能力標示+量尺分數、數學的選擇/非選/總分、英文的英閱/英聽/總分、寫作的級分/加權分,還有整份考卷的總分和校排名/班排名

⚠️ 目前依賴「姓名」當作比對依據,**如果班上有兩個學生姓名完全相同,系統無法分辨,可能會對錯人**,匯入後建議抽查一下。

## 專案結構

```
app/
  page.js                  登入頁
  dashboard/page.js        登入後的班級選單(老師)/ 自動導向(學生、家長)
  class/[classId]/page.js  班級總覽 + 差異化分群
  student/[id]/page.js     個別學生成績走勢圖
lib/
  supabaseClient.js        Supabase 連線設定
  grouping.js              三種差異化分群邏輯
supabase/
  schema.sql               資料庫結構 + 權限規則(空的,不含任何學生資料)
  migration_2_ranks_and_levels.sql   舊資料庫補上能力等級/排名欄位用
import_tool/
  import_regular_exam.py   段考/期中/期末考匯入(讀 Excel)
  import_mock_exam.py      模擬考匯入(讀 Excel)
  import_exam.py           舊版手填 CSV 匯入(備用)
```
