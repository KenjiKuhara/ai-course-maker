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

        alert(`インポート完了!\n成功: ${successCount}件\nエラー: ${errors.length}件\n${errors.join('\n')}`)
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        fetchCourseData()
    }
    reader.readAsText(file)
  }

  if (loading) return <div>コース情報を読み込み中...</div>
  if (!course) return <div>コースが見つかりません</div>

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <Link href="/admin" className="text-blue-500 hover:underline mb-2 block">← ダッシュボードに戻る</Link>
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
                        {importing ? 'インポート中...' : 'CSVインポート'}
                    </Label>
                 </div>
                 
                 <Link href={`/admin/grading?id=${courseId}`}>
                    <Button>採点ページへ</Button>
                 </Link>
            </div>
        </div>

        <Tabs defaultValue="students" className="w-full">
            <TabsList>
                <TabsTrigger value="students">学生一覧 ({students.length})</TabsTrigger>
                <TabsTrigger value="sessions">セッション管理</TabsTrigger>
            </TabsList>
            
            <TabsContent value="students">
                <Card>
                    <CardHeader>
                        <CardTitle>履修学生</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>学籍番号</TableHead>
                                    <TableHead>氏名</TableHead>
                                    <TableHead>メールアドレス</TableHead>
                                    <TableHead>操作</TableHead>
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
                                                        if (confirm(`${student.name} を ${newStatus} に変更しますか?`)) {
                                                            const { error } = await ApiClient.toggleEnrollmentStatus(student.student_id, courseId as string);
                                                            if (error) {
                                                                alert(`Failed: ${error.message}`);
                                                            } else {
                                                                fetchCourseData(); 
                                                            }
                                                        }
                                                    }}
                                                >
                                                    {student.enrollment_status === 'dropped' ? '復帰' : '履修中止'}
                                                </Button>

                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={async () => {
                                                        if (confirm(`${student.name} さんのメールアドレスをリセットしてもよろしいですか？`)) {
                                                            const { error } = await ApiClient.resetStudentEmail(student.student_id);
                                                            if (error) {
                                                                alert(`失敗しました: ${error.message}`);
                                                            } else {
                                                                alert("メールアドレスをリセットしました。");
                                                                fetchCourseData(); 
                                                            }
                                                        }
                                                    }}
                                                >
                                                    メールリセット
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {students.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500">履修学生はいません。</TableCell>
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
                        <CardTitle>セッション管理 &amp; 提出リンク</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-500">
                                    学生はここで生成されたリンクを使用してレポートを提出できます。標準の15回分のセッションを一括作成できます。
                                </p>
                                <Button 
                                    variant="outline"
                                    onClick={async () => {
                                        if (!confirm("第1回から第15回のセッションを初期化しますか？既存のセッションはスキップされます。")) return;
                                        
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
                                        alert(`初期化完了\n作成: ${createdCount}件\n(スキップ: ${sessionsToCreate.length - createdCount}件)`);
                                        fetchCourseData(); 
                                    }}
                                >
                                    セッション初期化 (1-15回)
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
                                                    alert(`第${num}回のリンクをコピーしました`);
                                                } else {
                                                    alert(`第${num}回のセッションはまだ作成されていません。「セッション初期化」をクリックしてください。`);
                                                }
                                            }}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">第{num}回</span>
                                                <span className={`text-xs ${exists ? 'text-green-600' : 'text-red-500'}`}>
                                                    {exists ? '有効' : '未作成'}
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
                                                {exists ? 'リンクをコピー' : '-'}
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
