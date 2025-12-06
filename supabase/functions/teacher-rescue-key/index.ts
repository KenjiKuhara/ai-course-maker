
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: Hex <-> Uint8Array
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

// AES Decryption
async function decrypt(encryptedText: string, keyHex: string) {
    // format: iv:ciphertext
    const [ivHex, cipherHex] = encryptedText.split(':');
    if (!ivHex || !cipherHex) throw new Error("Invalid encrypted format");

    const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(keyHex),
        { name: "AES-CBC" },
        false,
        ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: hexToBytes(ivHex) },
        key,
        hexToBytes(cipherHex)
    );

    return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        throw new Error("Missing Authorization header");
    }

    // 1. Verify User (Standard Supabase Auth)
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error("Unauthorized");

    // 2. Verify Teacher Role (Service Role needed to query teachers if RLS is strict, or just use the user's client if they have access)
    // Using Service Role to be safe and authoritative about "Is this ID in teachers table?"
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: teacher, error: teacherError } = await supabaseAdmin
        .from('teachers')
        .select('teacher_id')
        .eq('teacher_id', user.id)
        .single();
    
    if (teacherError || !teacher) {
        throw new Error("Forbidden: Not a teacher");
    }

    // 3. Get Student Key
    const { student_id } = await req.json();
    if (!student_id) throw new Error("Missing student_id");

    const { data: student, error: studentError } = await supabaseAdmin
        .from('students')
        .select('access_key_encrypted')
        .eq('student_id', student_id)
        .single();
    
    if (studentError || !student) throw new Error("Student not found");

    // 4. Decrypt
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    if (!encryptionKey) throw new Error("Server Config Error");

    const rawKey = await decrypt(student.access_key_encrypted, encryptionKey);

    return new Response(
      JSON.stringify({ key: rawKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
