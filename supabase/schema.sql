-- 1. Teachers (教員プロフィール: Auth連携)
create table teachers (
  teacher_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- 2. Courses (授業マスタ: 年度管理)
create table courses (
  course_id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(teacher_id),
  title text not null,
  year int not null, -- e.g., 2025
  term text not null, -- 'Spring', 'Fall'
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- 3. Students (学生マスタ: 暗号化キー保持)
create table students (
  student_id text primary key, -- 学籍番号
  name text not null,
  email text,
  access_key_encrypted text not null, -- AES Encrypted String (Not Hash)
  created_at timestamptz default now()
);

-- 4. Enrollments (履修関係)
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(course_id),
  student_id text not null references students(student_id),
  is_active boolean default true,
  unique(course_id, student_id)
);

-- 5. Sessions (回・締切管理)
create table sessions (
  session_id serial primary key,
  course_id uuid not null references courses(course_id),
  session_number int not null,
  title text not null,
  deadline timestamptz,
  allow_late_submission boolean default true
);

-- 6. Submissions (提出物・評価)
create table submissions (
  id uuid primary key default gen_random_uuid(),
  session_id int not null references sessions(session_id),
  student_id text not null references students(student_id),
  file_url text not null,
  original_filename text, -- Original name of the uploaded file
  score int, -- 0-100
  ai_feedback text,
  teacher_comment text, -- Teacher's manual comment when approving
  is_early_bird boolean default false, -- Bonus Flag (+5)
  is_late boolean default false,
  is_suspicious boolean default false,
  status text default 'pending', -- pending → ai_graded → approved/rejected
  submitted_at timestamptz default now()
);

-- RLS (Row Level Security) の有効化
alter table teachers enable row level security;
alter table courses enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table sessions enable row level security;
alter table submissions enable row level security;

-- 基本ポリシー (Teacherは自分のデータのみ操作可)
create policy "Teachers access own profile" on teachers for all using (auth.uid() = teacher_id);
create policy "Teachers access own courses" on courses for all using (auth.uid() = teacher_id);
-- (他テーブルへのポリシーは実装時に詳細定義)
