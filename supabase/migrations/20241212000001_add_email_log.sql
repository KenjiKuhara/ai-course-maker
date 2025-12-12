-- Add last_email_sent_at to enrollments
ALTER TABLE enrollments 
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP WITH TIME ZONE;
