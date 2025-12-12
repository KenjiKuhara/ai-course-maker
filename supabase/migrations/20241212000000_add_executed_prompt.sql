-- Add executed_prompt column to submissions table
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS executed_prompt TEXT;
