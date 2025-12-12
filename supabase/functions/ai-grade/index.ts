
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
    console.log('Received submission_id:', submission_id)
    
    if (!submission_id) throw new Error("submission_idが不足しています");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    
    const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');

    // 1. Get Submission
    const { data: submission, error: subError } = await supabase
        .from('submissions')
        .select('*, sessions(title, course_id, grading_prompt)')
        .eq('id', submission_id)
        .single();
    
    if (subError) throw new Error("提出物が見つかりません: " + subError.message);
    
    console.log('Submission found:', submission.id, 'file:', submission.file_url)

    // 2. Get Content (Prioritize report_text)
    let content = submission.report_text || "";
    const filePath = submission.file_url;
    // Safe access to file name
    const fileName = submission.original_filename?.toLowerCase() || (filePath ? filePath.toLowerCase() : "");
    
    if (!content && filePath) {
      console.log('No report_text found, attempting download fallback...')
      // Fallback for old submissions or if text extraction failed on client
      const { data: fileData, error: downloadError } = await supabase.storage
          .from('submissions')
          .download(filePath);
      
      if (downloadError) {
        content = "ファイルダウンロードエラー: " + downloadError.message;
      } else if (fileData) {
        try {
            const arrayBuffer = await fileData.arrayBuffer();
            if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv') || fileName.endsWith('.json')) {
               const decoder = new TextDecoder('utf-8');
               content = decoder.decode(arrayBuffer).substring(0, 20000);
            } else {
               content = "【システム注記】この提出は古い方式で行われたか、テキスト抽出に失敗しました。PDFまたはWordファイルの場合は、テキスト抽出が行われていないためAIは内容を読めません。";
            }
        } catch (e: any) {
             console.error('File read error:', e);
             content = "ファイル読み込みエラー: " + e.message;
        }
      }
    } else if (!content) {
        console.log('No content and no file path');
    } else {
      console.log('Using extracted report_text from database. Length:', content.length);
    }

    // 3. Get session info
    const session = submission.sessions;
    const sessionTitle = session?.title || "課題";
    const gradingPrompt = session?.grading_prompt || "";

    // Get Course System Prompt
    // Note: session contains course_id, we could fetch course, but let's try to get it via join if not already available.
    // However, the current query selects `sessions(title, course_id, grading_prompt)`. 
    // We need to fetch the course system_prompt.
    
    // Let's optimize: Fetch course system prompt separately or update the join if possible.
    // Supabase nested select limit might apply, but let's try.
    // Actually, distinct query is safer since we have course_id from session.
    
    let systemPrompt = "";
    if (session?.course_id) {
        const { data: courseData } = await supabase
            .from('courses')
            .select('system_prompt')
            .eq('course_id', session.course_id)
            .single();
        if (courseData?.system_prompt) {
            systemPrompt = courseData.system_prompt;
        }
    }

    // 4. Call Gemini
    if (!geminiKey) throw new Error("GEMINI_API_KEYが設定されていません");

    const prompt = `
あなたは大学の教授です。以下のレポートを採点してください。

課題: 「${sessionTitle}」

${systemPrompt ? `\n=== ベース評価基準 (全回共通) ===\n${systemPrompt}\n` : ''}
${gradingPrompt ? `\n=== 今回の特別指示 (採点重点項目) ===\n${gradingPrompt}\n` : ''}

=== 提出レポート情報 ===
ファイル名: ${fileName}
内容（抽出テキスト）:
${content.substring(0, 15000)}
=== 情報終わり ===

注意：
- 「テキスト抽出に失敗しました」や「バイナリデータ」とある場合は、内容は評価せず、score: 0 で feedback: "ファイルの中身を読み取れませんでした。再提出してください。" と回答してください。
- 抽出されたテキストが意味を成している場合のみ、内容に基づいて採点してください。

JSON形式で回答:
{
  "score": 数値(0-100),
  "feedback_data": {
    "summary": "総評（学生への励ましや全体的な感想）",
    "details": {
      "観点1（例えば内容の正確性）": "コメント",
      "観点2（例えば論理性）": "コメント"
    },
    "advice": "今後のための具体的な改善アドバイス"
  }
}
`;

    console.log('Calling Gemini API (gemini-2.0-flash)...')
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              responseMimeType: "application/json",
              temperature: 0.3
            }
        })
    });

    if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini API Error:", geminiRes.status, errText);
        throw new Error("Gemini APIエラー: " + geminiRes.status);
    }

    const geminiData = await geminiRes.json();
    const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error("Geminiからの応答が無効な形式です");
    
    // Clean up markdown code blocks if present (e.g. ```json ... ```)
    const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let result;
    try {
        result = JSON.parse(cleanedText);
    } catch (e) {
        console.error("JSON Parse Error. Raw text:", resultText);
        throw new Error("AIからの回答を解析できませんでした。");
    }
    console.log('Parsed result:', result)

    // 5. Update Submission
    const { error: updateError } = await supabase
        .from('submissions')
        .update({
            score: result.score,
            ai_feedback: JSON.stringify(result.feedback_data),
            status: 'ai_graded',
            executed_prompt: prompt
        })
        .eq('id', submission_id);

    if (updateError) throw new Error("提出物の更新に失敗しました: " + updateError.message);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
