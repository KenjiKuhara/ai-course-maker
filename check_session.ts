import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // console.warn("Supabase credentials not found in process.env. Ensure you are loading .env.local if running locally.");
}

const supabase = createClient(
  supabaseUrl ?? '',
  supabaseKey ?? ''
)

const courseId = 'e6329804-955f-4864-bde4-0bf648b93b1a';
const sessionNum = 1;

async function checkSession() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('course_id', courseId)
    .eq('session_number', sessionNum);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Sessions found:", data);
  }
}

checkSession();
