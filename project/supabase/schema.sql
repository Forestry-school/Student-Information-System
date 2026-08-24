-- ============================================================
-- 國中班級成績追蹤系統 - 資料庫結構
-- 在 Supabase 專案的 SQL Editor 貼上並執行這個檔案
-- ============================================================

-- 1. 班級
create table if not exists classes (
  id serial primary key,
  name text unique not null            -- 例如 '801'、'802'
);

-- 2. 學生
create table if not exists students (
  id serial primary key,
  class_id int references classes(id) on delete cascade,
  seat_no text not null,               -- 座號
  name text not null,
  unique (class_id, seat_no)
);

-- 3. 考試(段考/模擬考等)
create table if not exists exams (
  id serial primary key,
  name text unique not null,           -- 例如 '113上學期第一次段考'
  period text,                         -- 例如 '七年級上學期'
  order_index int not null             -- 時間排序,用來畫折線圖
);

-- 4. 成績(每個學生 x 每次考試 x 每個科目一筆)
create table if not exists scores (
  id bigserial primary key,
  student_id int references students(id) on delete cascade,
  exam_id int references exams(id) on delete cascade,
  subject text not null,               -- 國文/英文/數學/社會/自然/國際視野/平均...
  score numeric,
  level_text text,                     -- 模擬考等資料的「能力等級」,例如 A++、B+(段考通常留空)
  unique (student_id, exam_id, subject)
);

-- 4b. 每次考試的整體總分與排名(校排名/班排名這種「整份考卷」層級的資料,不屬於單一科目)
create table if not exists exam_summary (
  id bigserial primary key,
  student_id int references students(id) on delete cascade,
  exam_id int references exams(id) on delete cascade,
  total_score numeric,
  school_rank int,
  class_rank int,
  unique (student_id, exam_id)
);

-- 5. 使用者角色對應表
-- role: 'teacher' | 'student' | 'parent'
-- 老師 student_id 留空(可看全部);學生/家長綁定自己(孩子)的 student_id
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher','student','parent')),
  student_id int references students(id),
  display_name text
);

-- ============================================================
-- Row Level Security:老師看得到全部,學生/家長只看得到自己(孩子)的成績
-- ============================================================
alter table students enable row level security;
alter table scores enable row level security;
alter table exam_summary enable row level security;
alter table exams enable row level security;
alter table classes enable row level security;
alter table profiles enable row level security;

-- 老師:全部可讀
drop policy if exists "teachers read all classes" on classes;
create policy "teachers read all classes" on classes for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "teachers read all students" on students;
create policy "teachers read all students" on students for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "teachers read all scores" on scores;
create policy "teachers read all scores" on scores for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "everyone reads exams" on exams;
create policy "everyone reads exams" on exams for select using (true);

-- 學生/家長:只能看自己(孩子)那筆學生資料與成績
drop policy if exists "self read student" on students;
create policy "self read student" on students for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.student_id = students.id));

drop policy if exists "self read scores" on scores;
create policy "self read scores" on scores for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.student_id = scores.student_id));

drop policy if exists "teachers read all exam_summary" on exam_summary;
create policy "teachers read all exam_summary" on exam_summary for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "self read exam_summary" on exam_summary;
create policy "self read exam_summary" on exam_summary for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.student_id = exam_summary.student_id));

-- 每個人都能讀自己的 profile
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select
  using (auth.uid() = id);
