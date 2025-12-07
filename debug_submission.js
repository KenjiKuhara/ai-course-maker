
import { createClient } from '@supabase/supabase-js';

// Hardcoded from previous 'type .env.local' output
const supabaseUrl = "https://lvikdykdjpjhwukmwolj.supabase.co";
const supabaseKey = "sb_publishable_ffKdnToqWQ2RzFgIiRL2_A_KJVSoMs1"; // Anon Key

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Checking submissions schema...`);

  // Try to select the specific column
  const { data, error } = await supabase.from('submissions').select('id, file_url, original_filename').limit(5);
  
  if (error) {
      console.error("Error fetching submissions:", error);
  } else {
      console.log("Submissions data:", data);
  }

// check() removed
