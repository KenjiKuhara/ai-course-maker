-- Add original_filename column to submissions table
alter table submissions add column original_filename text;

-- Optional: Update existing records to have a default value if needed (e.g. from file_url)
-- update submissions set original_filename = split_part(file_url, '/', 3) where original_filename is null;
