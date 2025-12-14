
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars. Ensure you are loading .env.local if running locally.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const studentId = "7JET2210";
  console.log(`Checking for student: ${studentId}`);

  // 1. Get Student
  const { data: student } = await supabase.from('students').select('*').eq('student_id', studentId).single();
  console.log("Student:", student);

  // 2. Get Submissions
  const { data: submissions } = await supabase.from('submissions').select('*').eq('student_id', studentId);
  console.log("Submissions:", submissions);

  // 3. Get Sessions
  const { data: sessions } = await supabase.from('sessions').select('*');
  console.log("Sessions Count:", sessions?.length);
  if (submissions && submissions.length > 0) {
      submissions.forEach(sub => {
          const sess = sessions?.find(s => s.session_id === sub.session_id);
          console.log(`Submission ${sub.id} -> Session: ${sess?.session_number} (${sess?.title}) (ID: ${sub.session_id})`);
      });
  } else {
      console.log("No submissions found for this student.");
  }
}

check();
