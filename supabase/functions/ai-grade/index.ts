
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
    const { submission_id } = await req.json()
    if (!submission_id) throw new Error("Missing submission_id");

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get Submission
    const { data: submission, error: subError } = await supabase
        .from('submissions')
        .select('*, sessions(title)')
        .eq('id', submission_id)
        .single();
    
    if (subError || !submission) throw new Error("Submission not found");

    // 2. Get Content (Mocking content retrieval - assuming text stored in file_url or just grading based on dummy content for now since we don't have storage logic implemented fully)
    // In real app: download from Storage.
    const content = "This is a sample report text content."; // Placeholder.

    // 3. Call Gemini
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error("GEMINI_API_KEY missing");

    const prompt = `
    You are a strict university professor. Grade the following report for the course task "${submission.sessions?.title}".
    Content: "${content}"
    
    Output JSON format:
    {
        "score": number (0-100),
        "feedback": "string (Japanese, constructive feedback)"
    }
    `;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!geminiRes.ok) {
        const errObj = await geminiRes.text();
        console.error("Gemini Error:", errObj);
        throw new Error("AI Grading Failed");
    }

    const geminiData = await geminiRes.json();
    const resultText = geminiData.candidates[0].content.parts[0].text;
    const result = JSON.parse(resultText);

    // 4. Update Submission
    const { error: updateError } = await supabase
        .from('submissions')
        .update({
            score: result.score,
            ai_feedback: result.feedback,
            status: 'graded'
        })
        .eq('id', submission_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, result }),
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
