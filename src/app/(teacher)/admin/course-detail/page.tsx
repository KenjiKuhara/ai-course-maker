'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ApiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RescueModal } from '@/components/RescueModal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function CourseDetailContent() {
  const searchParams = useSearchParams()
  const courseId = searchParams.get('id')

  const [course, setCourse] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (courseId) fetchCourseData()
  }, [courseId])

  const fetchCourseData = async () => {
    setLoading(true)
    // 1. Course Info
    const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', courseId)
        .single()
    setCourse(courseData)

    // 2. Students (via Enrollments)
    const { data: enrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select('*, students(*)')
        .eq('course_id', courseId)
    
    if (enrollError) console.error("Error fetching enrollments", enrollError);

    if (enrollments) {
        // Transform data to flat structure including status
        const studentsData = enrollments.map((item: any) => ({
            ...item.students,
            enrollment_status: item.status // 'active' or 'dropped'
        }))
        setStudents(studentsData)
    }

    // 3. Status of Sessions
    const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('course_id', courseId)
    
    if (sessionsError) console.error("Error fetching sessions", sessionsError);
    if (sessionsData) {
        setSessions(sessionsData);
    }

    setLoading(false)
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !courseId) return

    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
        const text = event.target?.result as string
        const rows = text.split('\n').filter(r => r.trim() !== '')
        
        let successCount = 0
        let errors = []

        const hasHeader = rows[0] && (rows[0].toLowerCase().includes('student') && rows[0].toLowerCase().includes('name'))
        const dataRows = hasHeader ? rows.slice(1) : rows

        for (const row of dataRows) {
            const cols = row.split(',').map(c => c.trim())
            if (cols.length < 2) continue

            const studentId = cols[0]
            const name = cols[1]
            const email = cols[2] || ''

            try {
                const { error } = await ApiClient.registerStudent({
                    student_id: studentId,
                    name: name,
                    email: email,
                    course_ids: [courseId] // Auto enroll
                })
                
                if (error) {
                    console.error(`Failed to register ${studentId}:`, error)
                    errors.push(`${studentId}: ${error.message}`)
                } else {
                    successCount++
                }
            } catch (err: any) {
                errors.push(`${studentId}: ${err.message}`)
            }
        }

        alert(`Import Complete!\nSuccess: ${successCount}\nErrors: ${errors.length}\n${errors.join('\n')}`)
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        fetchCourseData()
    }
    reader.readAsText(file)
  }

  if (loading) return <div>Loading course...</div>
  if (!course) return <div>Course not found</div>

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <Link href="/admin" className="text-blue-500 hover:underline mb-2 block">← Back to Dashboard</Link>
                <h2 className="text-3xl font-bold tracking-tight">{course.title}</h2>
                <p className="text-gray-500">{course.year} {course.term}</p>
            </div>
            <div className="flex gap-4 items-center">
                 {/* CSV Import */}
                 <div className="flex items-center gap-2">
                    <Input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".csv" 
                        onChange={handleImportCSV} 
                        disabled={importing}
                        className="hidden"
                        id="csv-upload"
                    />
                    <Label htmlFor="csv-upload" className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 ${importing ? 'opacity-50' : ''}`}>
                        {importing ? 'Importing...' : 'Import CSV'}
                    </Label>
                 </div>
                 
                 <Link href={`/admin/grading?id=${courseId}`}>
                    <Button>Go to Grading</Button>
                 </Link>
            </div>
        </div>

        <Tabs defaultValue="students" className="w-full">
            <TabsList>
                <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
                <TabsTrigger value="sessions">Session Management</TabsTrigger>
            </TabsList>
            
            <TabsContent value="students">
                <Card>
                    <CardHeader>
                        <CardTitle>Enrolled Students</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student ID</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((student) => (
                                    <TableRow key={student.student_id} className={student.enrollment_status === 'dropped' ? 'bg-gray-100 text-gray-400' : ''}>
                                        <TableCell className="font-medium">{student.student_id}</TableCell>
                                        <TableCell>
                                            {student.name}
                                            {student.enrollment_status === 'dropped' && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Dropped</span>}
                                        </TableCell>
                                        <TableCell>{student.email}</TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <RescueModal studentId={student.student_id} studentName={student.name} />
                                                
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={async () => {
                                                        const newStatus = student.enrollment_status === 'dropped' ? 'Active' : 'Dropped';
                                                        if (confirm(`Mark ${student.name} as ${newStatus}?`)) {
                                                            const { error } = await ApiClient.toggleEnrollmentStatus(student.student_id, courseId as string);
                                                            if (error) {
                                                                alert(`Failed: ${error.message}`);
                                                            } else {
                                                                fetchCourseData(); 
                                                            }
                                                        }
                                                    }}
                                                >
                                                    {student.enrollment_status === 'dropped' ? 'Activate' : 'Drop'}
                                                </Button>

                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={async () => {
                                                        if (confirm(`Are you sure you want to reset the email for ${student.name}?`)) {
                                                            const { error } = await ApiClient.resetStudentEmail(student.student_id);
                                                            if (error) {
                                                                alert(`Failed: ${error.message}`);
                                                            } else {
                                                                alert("Email reset successfully.");
                                                                fetchCourseData(); 
                                                            }
                                                        }
                                                    }}
                                                >
                                                    Reset Email
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {students.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">No students enrolled.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="sessions">
                <Card>
                    <CardHeader>
                        <CardTitle>Session Management &amp; Submission Links</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-500">
                                    Students can submit reports using links generated here. You can initialize 15 standard sessions instantly.
                                </p>
                                <Button 
                                    variant="outline"
                                    onClick={async () => {
                                        if (!confirm("Initialize 15 sessions (Lecture 1-15)? Existing sessions will be skipped.")) return;
                                        
                                        const sessionsToCreate = Array.from({ length: 15 }, (_, i) => ({
                                            course_id: courseId,
                                            session_number: i + 1,
                                            title: `Lecture ${i + 1}`,
                                            allow_late_submission: true
                                        }));

                                        let createdCount = 0;
                                        for (const session of sessionsToCreate) {
                                            const { count } = await supabase
                                                .from('sessions')
                                                .select('*', { count: 'exact', head: true })
                                                .eq('course_id', courseId)
                                                .eq('session_number', session.session_number);
                                            
                                            if (count === 0) {
                                                const { error } = await supabase.from('sessions').insert(session);
                                                if (error) {
                                                    console.error(error);
                                                    alert(`Error creating session ${session.session_number}: ${error.message}`);
                                                }
                                                else createdCount++;
                                            }
                                        }
                                        alert(`Initialization Complete.\nCreated ${createdCount} new sessions.\n(Skipped ${sessionsToCreate.length - createdCount} existing sessions).`);
                                        fetchCourseData(); 
                                    }}
                                >
                                    Initialize Sessions (1-15)
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => {
                                    const exists = sessions.some(s => s.session_number === num);
                                    const link = `${window.location.origin}/submit?cid=${courseId}&snum=${num}`;
                                    
                                    return (
                                        <div 
                                            key={num} 
                                            className={`border rounded p-3 flex justify-between items-center transition-colors cursor-pointer ${exists ? 'bg-white hover:bg-gray-50' : 'bg-gray-100 opacity-70'}`}
                                            onClick={() => {
                                                if (exists) {
                                                    navigator.clipboard.writeText(link);
                                                    alert(`Copied Link for Session ${num}`);
                                                } else {
                                                    alert(`Session ${num} does not exist yet. Please click "Initialize Sessions" first.`);
                                                }
                                            }}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">Session {num}</span>
                                                <span className={`text-xs ${exists ? 'text-green-600' : 'text-red-500'}`}>
                                                    {exists ? 'Active' : 'Not Created'}
                                                </span>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant={exists ? "secondary" : "ghost"}
                                                disabled={!exists}
                                                onClick={(e) => {
                                                    e.stopPropagation(); 
                                                    if (exists) {
                                                        navigator.clipboard.writeText(link);
                                                        alert(`Copied Link for Session ${num}`);
                                                    }
                                                }}
                                            >
                                                {exists ? 'Copy Link' : '-'}
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
  )
}

export default function CourseDetailPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <CourseDetailContent />
        </Suspense>
    )
}
