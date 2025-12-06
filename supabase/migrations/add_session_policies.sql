-- Allow public read access to sessions (so students/anon can verify session title on submit page)
create policy "Public view sessions" on sessions for select using (true);

-- Allow teachers to insert/update/delete sessions for their own courses
create policy "Teachers manage course sessions" on sessions for all using (
  exists (
    select 1 from courses
    where courses.course_id = sessions.course_id
    and courses.teacher_id = auth.uid()
  )
);

-- Note: The insert policy check is slightly different in Supabase strict mode vs simplified. 
-- For INSERT, the 'using' clause checks the OLD row (doesn't exist) so we need 'with check'.
-- Re-defining for correct insert support:

drop policy if exists "Teachers manage course sessions" on sessions;

create policy "Teachers select own course sessions" on sessions for select using (
  exists (
    select 1 from courses
    where courses.course_id = sessions.course_id
    and courses.teacher_id = auth.uid()
  )
);

create policy "Teachers insert course sessions" on sessions for insert with check (
  exists (
    select 1 from courses
    where courses.course_id = sessions.course_id
    and courses.teacher_id = auth.uid()
  )
);

create policy "Teachers update course sessions" on sessions for update using (
  exists (
    select 1 from courses
    where courses.course_id = sessions.course_id
    and courses.teacher_id = auth.uid()
  )
);

create policy "Teachers delete course sessions" on sessions for delete using (
  exists (
    select 1 from courses
    where courses.course_id = sessions.course_id
    and courses.teacher_id = auth.uid()
  )
);
