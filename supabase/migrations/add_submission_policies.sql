-- Submissions Table Policies

-- 1. Teachers can view submissions for their own courses
-- Logic: Submission -> Session -> Course -> Teacher match
create policy "Teachers view course submissions" on submissions for select using (
  exists (
    select 1 from sessions
    join courses on sessions.course_id = courses.course_id
    where sessions.session_id = submissions.session_id
    and courses.teacher_id = auth.uid()
  )
);

-- 2. Teachers can update submissions (e.g. grading score, feedback)
create policy "Teachers update course submissions" on submissions for update using (
  exists (
    select 1 from sessions
    join courses on sessions.course_id = courses.course_id
    where sessions.session_id = submissions.session_id
    and courses.teacher_id = auth.uid()
  )
);

-- 3. Teachers can delete submissions (if needed)
create policy "Teachers delete course submissions" on submissions for delete using (
  exists (
    select 1 from sessions
    join courses on sessions.course_id = courses.course_id
    where sessions.session_id = submissions.session_id
    and courses.teacher_id = auth.uid()
  )
);
