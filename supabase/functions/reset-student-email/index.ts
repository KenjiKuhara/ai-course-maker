
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // Verify user is a teacher
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // Strict check: Is this user in the teachers table?
    const { data: teacher } = await supabaseAdmin
        .from('teachers')
        .select('teacher_id')
        .eq('teacher_id', user.id)
        .single();
    
    if (!teacher) throw new Error("Unauthorized: Not a teacher");

    const { student_id } = await req.json()
    if (!student_id) throw new Error("Missing student_id")

    // Reset email to null
    const { error: updateError } = await supabaseAdmin
        .from('students')
        .update({ email: null })
        .eq('student_id', student_id)
    
    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true, message: "Email reset successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
