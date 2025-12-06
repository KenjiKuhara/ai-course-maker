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

  const [courseTitle, setCourseTitle] = useState('Loading...')
  const [sessionTitle, setSessionTitle] = useState('Loading...')
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null)
  
  const [studentId, setStudentId] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [file, setFile] = useState<File | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (!courseIdParam) {
       setMessage({ type: 'error', text: 'Invalid link. Missing course ID.' })
       setCourseTitle('Error')
       return
    }

    const fetchInfo = async () => {
      try {
        // 1. Fetch Course
        const { data: course } = await supabase.from('courses').select('title').eq('course_id', courseIdParam).single()
        if (course) setCourseTitle(course.title)
        else setCourseTitle('Unknown Course')

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
             setSessionTitle('Unknown Session')
             setMessage({ type: 'error', text: 'Session not found or invalid link.' })
        }

      } catch (e) {
        console.error(e)
        setCourseTitle('Error loading data')
        setSessionTitle('Error')
      }
    }
    fetchInfo()
  }, [courseIdParam, sessionIdParam, sessionNumParam])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !courseIdParam || !resolvedSessionId) return

    setLoading(true)
    setMessage(null)

    try {
      // 1. Upload File
      const ext = file.name.split('.').pop()
      const fileName = `${courseIdParam}/${resolvedSessionId}/${studentId}_${Date.now()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('submissions')
        .upload(fileName, file)

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      
      const filePath = uploadData.path

      // 2. Submit API
      const { error, data } = await ApiClient.submitReport({
        student_id: studentId,
        access_key: accessKey,
        file_path: filePath,
        course_id: courseIdParam,
        session_id: resolvedSessionId
      })

      if (error) throw new Error(error.message || 'Submission failed')

      const successMsg = data.is_early_bird 
        ? 'Submission Successful! Early Bird Bonus Applied! 🎉' 
        : 'Submission Successful!'
      
      setMessage({ type: 'success', text: successMsg })
      setAccessKey('')
      setFile(null)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (!courseIdParam) {
     return <div className="p-4 text-center text-red-500">Invalid Link: Missing Course ID</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Submit Report</CardTitle>
          <CardDescription>
            {courseTitle} - {sessionTitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="studentId">Student ID</Label>
              <Input
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                placeholder="20251234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKey">Access Key</Label>
              <Input
                id="accessKey"
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                required
                placeholder="Your Secret Key"
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="file">Report File</Label>
              <Input
                id="file"
                type="file"
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
              {loading ? 'Submitting...' : 'Submit Report'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SubmitPage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">Loading form...</div>}>
            <SubmitContent />
        </Suspense>
    )
}
