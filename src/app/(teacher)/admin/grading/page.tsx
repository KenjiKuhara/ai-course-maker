'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

function GradingContent() {
  const searchParams = useSearchParams()
  const courseId = searchParams.get('id')

  const [courseTitle, setCourseTitle] = useState('Loading...')
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSessionNum, setSelectedSessionNum] = useState<string>('1')
  
  // Data for the table
  const [gradingData, setGradingData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // History Modal
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<any>(null)

  useEffect(() => {
    if (courseId) {
        fetchCourseInfo()
    }
  }, [courseId])

  useEffect(() => {
    if (courseId && selectedSessionNum) {
        fetchGradingData()
    }
  }, [courseId, selectedSessionNum])

  const fetchCourseInfo = async () => {
      const { data: course } = await supabase.from('courses').select('title').eq('course_id', courseId).single()
      if (course) setCourseTitle(course.title)
      
      const { data: sess } = await supabase.from('sessions').select('*').eq('course_id', courseId).order('session_number', { ascending: true })
      if (sess) setSessions(sess)
  }

  const fetchGradingData = async () => {
    setLoading(true)
    
    // 1. Get Session ID for selected number
    const targetSession = sessions.find(s => s.session_number.toString() === selectedSessionNum)
    if (!targetSession?.session_id) {
        // Retry logic if sessions weren't loaded yet? Or just wait for sessions to load.
        // If sessions are empty, we might not be able to fetch. 
        // We rely on 'sessions' state. If it's empty, we might need to fetch session by number directly/
        // But let's assume sessions loaded fast.
    }

    // 2. Fetch All Students (Active & Dropped)
    // We want to see everyone enrolled.
    const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, students(*)')
        .eq('course_id', courseId)
    
    // 3. Fetch Submissions for this Session
    // We need the ACTUAL session_id data from DB to query submissions
    const { data: sessionData } = await supabase
        .from('sessions')
        .select('session_id')
        .eq('course_id', courseId)
        .eq('session_number', selectedSessionNum)
        .single()
    
    let validSessionId = sessionData?.session_id;

    let submissions: any[] = []
    if (validSessionId) {
        const { data: subData } = await supabase
            .from('submissions')
            .select('*')
            .eq('session_id', validSessionId)
            .order('submitted_at', { ascending: false }) // Latest first
        submissions = subData || []
    }

    // 4. Merge Data
    // We want one row per student.
    // If multiple submissions, pick the latest one for display, but keep all for history.
    
    if (enrollments) {
        const merged = enrollments.map((enr: any) => {
            const studentId = enr.student_id
            const studentSubmissions = submissions.filter((s: any) => s.student_id === studentId)
            const latestSubmission = studentSubmissions.length > 0 ? studentSubmissions[0] : null
            
            return {
                student: enr.students,
                enrollment: enr,
                latestSubmission: latestSubmission,
                allSubmissions: studentSubmissions,
                status: latestSubmission ? (latestSubmission.status || 'Submitted') : 'Missing',
                submissionCount: studentSubmissions.length
            }
        })
        
        // Sort: Submitted first, then by ID? Or just by ID. Let's do by Student ID.
        merged.sort((a: any, b: any) => a.student.student_id.localeCompare(b.student.student_id))
        setGradingData(merged)
    }

    setLoading(false)
  }

  const getFileUrl = (path: string) => {
      // Assuming public bucket or signed URL. 
      // If public bucket:
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/submissions/${path}`
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
             <div>
                <Link href={`/admin/course-detail?id=${courseId}`} className="text-blue-500 hover:underline mb-2 block">← Back to Course</Link>
                <h2 className="text-3xl font-bold tracking-tight">Grading: {courseTitle}</h2>
            </div>
            <div className="flex items-center gap-2">
                <span className="font-medium">Session:</span>
                <Select value={selectedSessionNum} onValueChange={setSelectedSessionNum}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select Session" />
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from({length: 15}, (_, i) => i + 1).map(num => (
                            <SelectItem key={num} value={num.toString()}>
                                Session {num} {sessions.find(s => s.session_number === num)?.title ? `- ${sessions.find(s => s.session_number === num)?.title}` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Student Status for Session {selectedSessionNum}</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Student ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Latest File</TableHead>
                            <TableHead>Submitted At</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                        ) : gradingData.map((item) => (
                            <TableRow key={item.student.student_id} className={item.enrollment.status === 'dropped' ? 'opacity-50 bg-gray-50' : ''}>
                                <TableCell className="font-medium">{item.student.student_id}</TableCell>
                                <TableCell>
                                    {item.student.name}
                                    {item.enrollment.status === 'dropped' && <Badge variant="secondary" className="ml-2">Dropped</Badge>}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission ? (
                                        <Badge className="bg-green-600 hover:bg-green-700">Submitted</Badge>
                                    ) : (
                                        <Badge variant="destructive">Missing</Badge>
                                    )}
                                    {item.latestSubmission?.is_late && <Badge variant="outline" className="ml-2 text-red-500 border-red-500">Late</Badge>}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission ? (
                                        <a 
                                            href={getFileUrl(item.latestSubmission.file_url)} 
                                            target="_blank" 
                                            className="text-blue-600 underline text-sm"
                                            download
                                        >
                                            Download ({item.latestSubmission.original_filename ? item.latestSubmission.original_filename.substring(0, 15) + (item.latestSubmission.original_filename.length > 15 ? '...' : '') : 'Latest'})
                                        </a>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission ? new Date(item.latestSubmission.submitted_at).toLocaleString() : '-'}
                                </TableCell>
                                <TableCell>
                                    <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => {
                                            setSelectedStudentHistory(item)
                                            setHistoryOpen(true)
                                        }}
                                        disabled={item.submissionCount === 0}
                                    >
                                        History ({item.submissionCount})
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* History Modal */}
        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Submission History: {selectedStudentHistory?.student.name}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <Table>
                         <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>File</TableHead>
                                <TableHead>Score</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedStudentHistory?.allSubmissions.map((sub: any) => (
                                <TableRow key={sub.id}>
                                    <TableCell>{new Date(sub.submitted_at).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <a 
                                            href={getFileUrl(sub.file_url)} 
                                            target="_blank" 
                                            className="text-blue-600 underline"
                                        >

                                            {sub.original_filename || 'Download'}
                                        </a>
                                    </TableCell>
                                    <TableCell>{sub.score || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    </div>
  )
}

export default function GradingPage() {
    return (
        <Suspense fallback={<div>Loading grading...</div>}>
            <GradingContent />
        </Suspense>
    )
}
