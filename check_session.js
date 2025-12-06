
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env.local')));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const courseId = 'e6329804-955f-4864-bde4-0bf648b93b1a';
const sessionNum = 1;

async function checkSession() {
  console.log(`Checking for Course: ${courseId}, Session: ${sessionNum}`);
  
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
