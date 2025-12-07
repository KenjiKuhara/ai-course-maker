-- Add report_text column to submissions table
ALTER TABLE submissions
ADD COLUMN report_text text;

COMMENT ON COLUMN submissions.report_text IS 'Extracted text content from the submitted file for AI grading';
