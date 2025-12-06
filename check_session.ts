
import { createClient } from 'npm:@supabase/supabase-js@2'
import "jsr:@std/dotenv/load";

const supabase = createClient(
  Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
