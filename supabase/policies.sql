-- RLS Policies for Enrollments
-- Teachers can view enrollments for their own courses
create policy "Teachers can view enrollments for their courses"
  on enrollments for select
  using (
    exists (
      select 1 from courses
      where courses.course_id = enrollments.course_id
      and courses.teacher_id = auth.uid()
    )
  );

-- Teachers can insert enrollments (via simple API calls if done from client, though usually done via Edge Function which uses Service Role. If Client uses API directly, this is needed. Edge Function bypasses RLS so this affects the UI Select.)

-- RLS Policies for Students
-- Teachers can view students who are enrolled in their courses
create policy "Teachers can view enrolled students"
  on students for select
  using (
    exists (
      select 1 from enrollments
      join courses on enrollments.course_id = courses.course_id
      where enrollments.student_id = students.student_id
      and courses.teacher_id = auth.uid()
    )
  );

-- Teachers can update (rescue key) students in their courses? 
-- Actually rescue is done via Edge Function (Service Role), so SELECT is the main requirement for the UI list.
