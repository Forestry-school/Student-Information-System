-- 如果你已經執行過舊版的 schema.sql、資料庫已經有資料了,
-- 執行這個檔案來補上「能力等級」跟「排名」的欄位/資料表,不會動到原本的資料。

alter table scores add column if not exists level_text text;

create table if not exists exam_summary (
  id bigserial primary key,
  student_id int references students(id) on delete cascade,
  exam_id int references exams(id) on delete cascade,
  total_score numeric,
  school_rank int,
  class_rank int,
  unique (student_id, exam_id)
);

alter table exam_summary enable row level security;

drop policy if exists "teachers read all exam_summary" on exam_summary;
create policy "teachers read all exam_summary" on exam_summary for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));

drop policy if exists "self read exam_summary" on exam_summary;
create policy "self read exam_summary" on exam_summary for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.student_id = exam_summary.student_id));
