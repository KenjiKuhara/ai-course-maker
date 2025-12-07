'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ApiClient } from '@/lib/api-client'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

function SubmitContent() {
  const searchParams = useSearchParams()
  const courseIdParam = searchParams.get('cid')
  const sessionIdParam = searchParams.get('sid')
  const sessionNumParam = searchParams.get('snum')

  const [courseTitle, setCourseTitle] = useState('読み込み中...')
  const [sessionTitle, setSessionTitle] = useState('読み込み中...')
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null)
  
  const [studentId, setStudentId] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [file, setFile] = useState<File | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (!courseIdParam) {
       setMessage({ type: 'error', text: '無効なリンクです。コースIDが見つかりません。' })
       setCourseTitle('エラー')
       return
    }

    const fetchInfo = async () => {
      try {
        // 1. Fetch Course
        const { data: course } = await supabase.from('courses').select('title').eq('course_id', courseIdParam).single()
        if (course) setCourseTitle(course.title)
        else setCourseTitle('不明なコース')

        // 2. Fetch Session (by ID or Number)
        let sessionData = null;
        if (sessionIdParam) {
             const { data } = await supabase.from('sessions').select('session_id, title').eq('session_id', sessionIdParam).single()
             sessionData = data;
        } else if (sessionNumParam) {
             const { data } = await supabase.from('sessions').select('session_id, title').eq('course_id', courseIdParam).eq('session_number', sessionNumParam).single()
             sessionData = data;
        }

        if (sessionData) {
            setResolvedSessionId(sessionData.session_id)
            setSessionTitle(sessionData.title)
        } else {
             setSessionTitle('不明なセッション')
             setMessage({ type: 'error', text: 'セッションが見つからないか、リンクが無効です。' })
        }

      } catch (e) {
        console.error(e)
        setCourseTitle('データの読み込みエラー')
        setSessionTitle('エラー')
      }
    }
    fetchInfo()
  }, [courseIdParam, sessionIdParam, sessionNumParam])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const extractFileText = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    
    try {
      if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') {
        return await file.text()
      } 
      else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer()
        // Dynamic import to avoid SSR issues
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ arrayBuffer })
        return result.value
      } 
      else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer()
        const pdfjsLib = await import('pdfjs-dist')
        // Set worker using CDN
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        let fullText = ''
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const textContent = await page.getTextContent()
          const pageText = textContent.items.map((item: any) => item.str).join(' ')
          fullText += pageText + '\n'
        }
        return fullText
      }
    } catch (e) {
      console.error('Text extraction failed:', e)
      return "テキスト抽出に失敗しました。"
    }
    return ""
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !courseIdParam || !resolvedSessionId) return

    setLoading(true)
    setMessage(null)

    try {
      // 1. Extract Text
      const extractedText = await extractFileText(file)
      console.log('Extracted text length:', extractedText.length)

      // 2. Upload File
      const ext = file.name.split('.').pop()
      const fileName = `${courseIdParam}/${resolvedSessionId}/${studentId}_${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('submissions')
        .upload(fileName, file)

      if (uploadError) throw new Error(`アップロード失敗: ${uploadError.message}`)
      
      const filePath = uploadData.path

      // 3. Submit API
      const { error, data } = await ApiClient.submitReport({
        student_id: studentId,
        access_key: accessKey,
        file_path: filePath,
        course_id: courseIdParam,
        session_id: resolvedSessionId,
        original_filename: file.name,
        report_text: extractedText
      })

      if (error) throw new Error(error.message || '提出に失敗しました')

      const successMsg = data.is_early_bird 
        ? '提出が完了しました！早期提出ボーナス適用！ 🎉' 
        : '提出が完了しました！'
      
      setMessage({ type: 'success', text: successMsg })
      setAccessKey('')
      setFile(null)
    } catch (err: any) {
      // Basic translations for common backend errors if they come in English
      let msg = err.message;
      if (msg.includes("Invalid Student ID")) msg = "学籍番号が無効です";
      if (msg.includes("Invalid Access Key")) msg = "アクセスキーが間違っています";
      if (msg.includes("Missing required fields")) msg = "必須項目が不足しています";
      if (msg.includes("Not enrolled")) msg = "このコースに登録されていません";
      if (msg.includes("Invalid Session")) msg = "セッションが無効です";
      
      setMessage({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }

  if (!courseIdParam) {
     return <div className="p-4 text-center text-red-500">無効なリンクです: コースIDが見つかりません</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>レポート提出</CardTitle>
          <CardDescription>
            {courseTitle} - {sessionTitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">学籍番号</Label>
              <Input
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                placeholder="20251234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKey">アクセスキー</Label>
              <Input
                id="accessKey"
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                required
                placeholder="秘密のキー"
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="file">レポートファイル (PDF, Word, テキスト)</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>

            {message && (
              <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '提出中...' : '提出する'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SubmitPage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">読み込み中...</div>}>
            <SubmitContent />
        </Suspense>
    )
}
