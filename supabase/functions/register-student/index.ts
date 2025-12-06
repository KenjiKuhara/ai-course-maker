
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: Hex <-> Uint8Array
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

// AES Encryption
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
  // Return IV:Encrypted
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { student_id, email, course_ids, name } = await req.json()

    if (!student_id) {
      throw new Error("Missing required field: student_id")
    }

    // 3. Check existence and permissions
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if student exists
    const { data: existingStudent, error: findError } = await supabase
      .from('students')
      .select('*')
      .eq('student_id', student_id)
      .single();

    let accessKeyEncrypted = null;
    let accessKey = null;
    let studentNameForEmail = name; // Initialize with name from request

    if (!existingStudent) {
        // [New Registration]
        // Only allow if Name is provided (Teacher Import context)
        // If Name is missing, it's a Student trying to claim a non-existent ID -> Error
        if (!name) {
            throw new Error("Student ID not found. Please ask your teacher to register you.");
        }

        // Generate Key
        const rawKey = crypto.getRandomValues(new Uint8Array(16));
        accessKey = bytesToHex(rawKey);
        
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
        if (!encryptionKey) throw new Error("Server Config Error: ENCRYPTION_KEY missing");
        accessKeyEncrypted = await encrypt(accessKey, encryptionKey);

        // Insert
        const { error } = await supabase.from('students').insert({
            student_id,
            name,
            email: email || null,
            access_key_encrypted: accessKeyEncrypted
        });
        if (error) throw error;

    } else {
        // [Update Existing]
        // Scenario 1: Teacher Re-Import (Name provided, Email might be empty)
        // Scenario 2: Student Claim (Name empty, Email provided)

        studentNameForEmail = existingStudent.name; // Use existing name for email

        const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
        if (!encryptionKey) throw new Error("Server Config Error: ENCRYPTION_KEY missing");

        const updatePayload: any = {};
        
        // 1. Name: Update if provided (Teacher fixing typo)
        if (name && name !== existingStudent.name) { // Only update if different
            updatePayload.name = name;
            studentNameForEmail = name; // Update name for email if it was changed
        }

        // 2. Email & Key Logic
        if (existingStudent.email) {
            // DB has Email
            if (email) {
                if (existingStudent.email === email) {
                    // Same Email -> Re-issue Key
                    console.log(`Re-issuing key for ${student_id}`);
                    const rawKey = crypto.getRandomValues(new Uint8Array(16));
                    accessKey = bytesToHex(rawKey);
                    accessKeyEncrypted = await encrypt(accessKey, encryptionKey);
                    
                    updatePayload.access_key_encrypted = accessKeyEncrypted;
                    updatePayload.email = email; 
                } else {
                    // Different Email -> Block (unless admin? but here assume strict)
                    throw new Error("This account is already registered with a different email.");
                }
            } else {
                // Input Email is Empty (Teacher re-import without email column)
                // -> SAFE: Do NOT touch Email or Key.
                console.log(`Keeping existing email/key for ${student_id}`);
            }
        } else {
            // DB has No Email
            if (email) {
                 // Claiming account! Generate Key.
                 const rawKey = crypto.getRandomValues(new Uint8Array(16));
                 accessKey = bytesToHex(rawKey);
                 accessKeyEncrypted = await encrypt(accessKey, encryptionKey);

                 updatePayload.access_key_encrypted = accessKeyEncrypted;
                 updatePayload.email = email;
            } else {
                // Both empty. Do nothing for email/key.
                // If Name was updated, we still proceed.
            }
        }

        if (Object.keys(updatePayload).length > 0) {
            const { error } = await supabase
                .from('students')
                .update(updatePayload)
                .eq('student_id', student_id);
            if (error) throw error;
        }

        // If we didn't generate a new key, we can't show/email it.
        // But for "Teacher Re-Import" (no email), we don't need to return the key unless it changed.
    }

    // 3.5 Enroll in courses if provided
    if (course_ids && Array.isArray(course_ids) && course_ids.length > 0) {
      const enrollments = course_ids.map((course_id: string) => ({
        course_id,
        student_id
      }));
      const { error: enrollError } = await supabase.from('enrollments').upsert(enrollments, { onConflict: 'course_id, student_id' });
       if (enrollError) {
          console.error("Enrollment Error:", enrollError);
       }
    }

    // 4. Send Email (Only if accessKey was generated AND email exists)
    const sendGridKey = Deno.env.get('SENDGRID_API_KEY');
    if (accessKey && email && sendGridKey) {
       // Use updated name if available, otherwise existing
       const displayName = name || existingStudent?.name || "Student"; 

       const emailRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendGridKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: 'noreply@aicoursemaker.com', name: 'AI Course Maker' },
          subject: '【AI Course Maker】登録完了',
          content: [{
            type: 'text/plain',
            value: `登録が完了しました。\n\n氏名: ${displayName}\n学籍番号: ${student_id}\n\n----------------------------\nあなたのアクセスキー: ${accessKey}\n----------------------------\n\nこのキーは授業で毎回使います。メモしてください。`
          }]
        })
      });
       if (!emailRes.ok) {
         console.error("SendGrid Error:", await emailRes.text());
       }
    } else {
        if (accessKey) {
             console.log("Email skipped. Key generated:", accessKey);
        } else {
             console.log("No new key generated. Email skipped.");
        }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Registered successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
