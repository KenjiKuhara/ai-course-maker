
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    // API KEY from secrets
    const apiKey = Deno.env.get('SMTP2GO_API_KEY');
    if (!apiKey) throw new Error("SMTP2GO_API_KEY is missing");

    const { course_id, student_id } = await req.json()

    if (!course_id) {
        throw new Error("Missing course_id");
    }

    // 1. Fetch Course Info
    const { data: course } = await supabaseClient
        .from('courses')
        .select('title')
        .eq('course_id', course_id)
        .single()

    // 2. Fetch Sessions
    const { data: sessions } = await supabaseClient
        .from('sessions')
        .select('session_number, title')
        .eq('course_id', course_id)
        .order('session_number', { ascending: true })

    if (!sessions || sessions.length === 0) {
        throw new Error("有効なセッションが見つかりません");
    }

    // 3. Fetch Active Students
    let query = supabaseClient
        .from('enrollments')
        .select('student_id, students(name, email)')
        .eq('course_id', course_id)
        .eq('status', 'active')

    if (student_id) {
        query = query.eq('student_id', student_id)
    }

    const { data: enrollments } = await query;

    if (!enrollments || enrollments.length === 0) {
        return new Response(JSON.stringify({ message: "対象学生がいません", count: 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    // 4. Fetch Submissions
    const { data: submissions } = await supabaseClient
        .from('submissions')
        .select('student_id, session_id, score, status, sessions(session_number)')
        .eq('sessions.course_id', course_id)
    
    const submissionsByStudent = {};
    if (submissions) {
        submissions.forEach(sub => {
            if (!submissionsByStudent[sub.student_id]) submissionsByStudent[sub.student_id] = [];
            if (sub.sessions) {
                submissionsByStudent[sub.student_id].push({
                    session_number: sub.sessions.session_number,
                    score: sub.score,
                    status: sub.status
                });
            }
        });
    }

    let sentCount = 0;
    const errors = [];

    // 5. Send Loop via API
    for (const enrollment of enrollments) {
        const student = enrollment.students;
        if (!student.email) continue;
        const studentCode = enrollment.student_id; // Use enrollment's student_id, not nested student object
        const studentSubmissions = submissionsByStudent[studentCode] || [];
        
        const missingSessions = [];
        for (const session of sessions) {
            const sub = studentSubmissions.find(s => s.session_number === session.session_number);
            if (!sub || (sub.status !== 'pending' && sub.status !== 'ai_graded' && sub.status !== 'approved')) {
                 // Condition check: actually we want to list MISSING ones.
                 // If sub exists and has status 'pending/ai_graded/approved', it is SUBMITTED.
                 // So if !sub OR status is rejected/missing...
                 if (!sub || sub.status === 'missing' || sub.status === 'rejected') {
                     missingSessions.push(`第${session.session_number}回: ${session.title}`);
                 }
            }
        }
        
        // Generate Content
        const subject = `【重要】レポート提出状況のお知らせ (${course?.title || '授業'})`;
        let body = `${student.name} さん\n\n`;
        body += `現在のレポート提出状況をお知らせします。\n\n`;
        
        if (missingSessions.length > 0) {
            body += `⚠️ 以下の回が「未提出」または「却下」状態です。\n`;
            missingSessions.forEach(s => body += `  - ${s}\n`);
            body += `\n早急に提出を確認してください。\n\n`;
        } else {
            body += `✅ 現在までの課題はすべて提出されています。素晴らしいです！\n\n`;
        }
        body += `--------------------------------------------------\n`;
        body += `※本メールは自動送信されています。\n`;

        // Send via SMTP2GO API
        const response = await fetch("https://api.smtp2go.com/v3/email/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                api_key: apiKey,
                to: [`${student.name} <${student.email}>`],
                sender: "dxconsulting@proinnv.com",
                subject: subject,
                text_body: body
            })
        });

        const resJson = await response.json();
        
        if (resJson.data && resJson.data.succeeded > 0) {
            // Log update
            await supabaseClient
                .from('enrollments')
                .update({ last_email_sent_at: new Date().toISOString() })
                .eq('student_id', studentCode)
                .eq('course_id', course_id);
            sentCount++;
        } else {
            console.error(`Failed for ${student.name}`, resJson);
            errors.push(`${student.name}: API Error`);
        }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, errors: errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

