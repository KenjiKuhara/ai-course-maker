
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: Hex <-> Uint8Array
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

// AES Encryption (Same as register-student)
async function encrypt(text: string, keyHex: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    encoded
  );
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { student_id, access_key, file_path, course_id, session_id, original_filename } = await req.json()
    if (!student_id || !access_key || !file_path || !course_id || !session_id) {
        throw new Error("Missing required fields");
    }

    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Authenticate Student (Check Key)
    // We cannot decrypt the DB value easily to compare (we could, but encrypting input is safer/easier if deterministic? No, IV is random).
    // So we must get the DB value and Decrypt it OR Decrypt the DB value and compare with input.
    // Wait, the requirement said "generate 32 digit random key... AES encrypted DB save... Mail raw key".
    // So for Authentication: Input Key -> Encrypt? No, IV is random, so Encrypt(Input) != DB_Value.
    // We MUST Decrypt the DB_Value and compare with Input Key.
    // OR: Use deterministic encryption (IV=fixed) which is bad practice but allows search.
    // Requirement says "AES-256-CBC", implies standard random IV.
    // So: Select * from students where student_id = ?. Decrypt(student.key) == input_key?

    const { data: student, error: stError } = await adminClient
        .from('students')
        .select('access_key_encrypted, name')
        .eq('student_id', student_id)
        .single();
    
    if (stError || !student) throw new Error("Invalid Student ID");

    // Decrypt DB key
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    if (!encryptionKey) throw new Error("Server Config Error");

    // Decrypt Helper inline (reuse teacher logic)
    const [ivHex, cipherHex] = student.access_key_encrypted.split(':');
    const dbKeyRaw = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: hexToBytes(ivHex) },
        await crypto.subtle.importKey("raw", hexToBytes(encryptionKey), { name: "AES-CBC" }, false, ["decrypt"]),
        hexToBytes(cipherHex)
    );
    const dbKey = new TextDecoder().decode(dbKeyRaw);

    if (dbKey !== access_key) {
        throw new Error("Invalid Access Key");
    }

    // 2. Check Enrollment
    const { data: enrollment, error: enError } = await adminClient
        .from('enrollments')
        .select('id')
        .eq('course_id', course_id)
        .eq('student_id', student_id)
        .eq('is_active', true)
        .single();
    
    if (enError || !enrollment) throw new Error("Not enrolled in this course");

    // 3. Check Deadline
    const { data: session, error: sessError } = await adminClient
        .from('sessions')
        .select('deadline, session_number')
        .eq('session_id', session_id)
        .single();
    
    if (sessError || !session) throw new Error("Invalid Session");

    const now = new Date();
    const deadline = new Date(session.deadline);
    const is_early_bird = now < deadline; // Logic: If submitted before deadline -> Bonus
    const is_late = now > deadline; // Logic: If submitted after -> Late

    // 4. Submit
    const { data: submission, error: subError } = await adminClient
        .from('submissions')
        .insert({
            session_id,
            student_id,
            file_url: file_path, // Assumed to be Supabase Storage path or URL provided by client
            original_filename: original_filename,
            is_early_bird,
            is_late,
            status: 'pending' // Waiting for AI
        })
        .select()
        .single();
    
    if (subError) throw subError;

    // 5. Invoke AI Grading
    // Fire and forget?
    // User says "Asynchronous invoke".
    // We can use edge-runtime feature or just await and not return result, or use `edge_functions.invoke`
    
    // We'll trigger it. If it fails, we log but don't fail the submission.
    // Actually, `supabase-js` invoke is simple.
    adminClient.functions.invoke('ai-grade', {
        body: { submission_id: submission.id }
    });

    return new Response(
      JSON.stringify({ success: true, submission_id: submission.id, is_early_bird }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
