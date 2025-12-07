-- Add teacher_comment column to submissions table
-- This allows teachers to add their own comments when approving/modifying AI grades

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS teacher_comment text;

-- Add comment to explain the column
COMMENT ON COLUMN submissions.teacher_comment IS 'Teacher''s manual comment when approving or modifying AI grade';
