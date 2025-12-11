-- Add system_prompt to courses
ALTER TABLE courses ADD COLUMN system_prompt text;

-- Create course_templates table
CREATE TABLE course_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(teacher_id) ON DELETE CASCADE,
  keyword text NOT NULL,
  system_prompt text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS for course_templates
ALTER TABLE course_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers access own templates" ON course_templates FOR ALL USING (auth.uid() = teacher_id);
