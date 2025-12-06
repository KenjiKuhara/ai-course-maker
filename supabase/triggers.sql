-- Trigger to automatically create a teacher profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.teachers (teacher_id, name, email)
  values (new.id, 'Teacher', new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Ensure the trigger doesn't exist before creating (or just replace)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: Insert existing auth users into the teachers table
insert into public.teachers (teacher_id, name, email)
select id, 'Teacher', email from auth.users
where id not in (select teacher_id from public.teachers);
