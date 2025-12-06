-- Add status column to enrollments table
-- Check if column exists first (idempotent-ish) or just add it
alter table enrollments add column if not exists status text default 'active' check (status in ('active', 'dropped'));

-- Allow teachers to see status (already covered by select policy)
-- Teachers need to update status (will do via Edge Function for now to avoid RLS complexity)
