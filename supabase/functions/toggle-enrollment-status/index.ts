
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

    const { student_id, course_id, status } = await req.json()
    if (!student_id || !course_id) throw new Error("Missing request parameters")

    // Verify teacher owns the course
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: course } = await supabaseAdmin
        .from('courses')
        .select('teacher_id')
        .eq('course_id', course_id)
        .single();
    
    if (!course || course.teacher_id !== user.id) {
        throw new Error("Unauthorized: You do not own this course");
    }

    // Toggle logic if status not provided
    let newStatus = status;
    if (!newStatus) {
        // Get current status
        const { data: enrollment } = await supabaseAdmin
            .from('enrollments')
            .select('status')
            .eq('student_id', student_id)
            .eq('course_id', course_id)
            .single();
        
        if (enrollment) {
            newStatus = enrollment.status === 'active' ? 'dropped' : 'active';
        } else {
            newStatus = 'active'; // Should not happen if enrolled
        }
    }

    // Update
    const { error: updateError } = await supabaseAdmin
        .from('enrollments')
        .update({ status: newStatus })
        .eq('student_id', student_id)
        .eq('course_id', course_id)
    
    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true, status: newStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
