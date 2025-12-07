
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
    const { 
      submission_id, 
      action, // 'approve' or 'reject'
      teacher_comment,
      score_override // Optional: if teacher wants to change the score
    } = await req.json()
    
    if (!submission_id || !action) {
      throw new Error("submission_idまたはactionが不足しています");
    }
    
    if (!['approve', 'reject'].includes(action)) {
      throw new Error("Actionは'approve'または'reject'である必要があります");
    }

    // Create admin client
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the submission exists
    const { data: submission, error: fetchError } = await supabase
        .from('submissions')
        .select('id, score, status')
        .eq('id', submission_id)
        .single();
    
    if (fetchError || !submission) {
      throw new Error("提出物が見つかりません");
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      status: action === 'approve' ? 'approved' : 'rejected',
      teacher_comment: teacher_comment || null
    };

    // If score override is provided, update the score
    if (score_override !== undefined && score_override !== null) {
      const score = parseInt(score_override);
      if (isNaN(score) || score < 0 || score > 100) {
        throw new Error("スコアは0から100の間である必要があります");
      }
      updateData.score = score;
    }

    // Update the submission
    const { error: updateError } = await supabase
        .from('submissions')
        .update(updateData)
        .eq('id', submission_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        action,
        submission_id,
        new_status: updateData.status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
