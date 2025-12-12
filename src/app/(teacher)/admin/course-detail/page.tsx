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
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

function CourseDetailContent() {
  const searchParams = useSearchParams()
  const courseId = searchParams.get('id')

  const [course, setCourse] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Prompt Editing State (Session)
  const [editingPromptSession, setEditingPromptSession] = useState<any>(null)
  const [promptText, setPromptText] = useState('')

  // System Prompt State (Course)
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false)
  const [systemPromptText, setSystemPromptText] = useState('')

  // Bulk Email State
  const [sendingEmail, setSendingEmail] = useState(false)

  // Session Management State
  const [sessionCount, setSessionCount] = useState(5)

  // Tab State
  const [activeTab, setActiveTab] = useState('students')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'student_id', direction: 'asc' })

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

    // 2. Status of Sessions
    const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('course_id', courseId)
        .order('session_number', { ascending: true })
    
    if (sessionsError) console.error("Error fetching sessions", sessionsError);
    if (sessionsData) {
        setSessions(sessionsData);
    }

    // 3. Get Submissions for counting (using session_ids)
    let submissionCounts: any = {};
    if (sessionsData && sessionsData.length > 0) {
        const sessionIds = sessionsData.map((s: any) => s.session_id);
        const { data: submissionsData } = await supabase
            .from('submissions')
            .select('student_id, session_id') // Fetch session_id for uniqueness check
            .in('session_id', sessionIds) 
        
        // Count unique sessions submitted per student
        const uniqueSubmissions = (submissionsData || []).reduce((acc: any, curr: any) => {
            if (!acc[curr.student_id]) {
                acc[curr.student_id] = new Set();
            }
            if (curr.session_id) {
                acc[curr.student_id].add(curr.session_id);
            }
            return acc;
        }, {});

        submissionCounts = Object.keys(uniqueSubmissions).reduce((acc: any, studentId: string) => {
            acc[studentId] = uniqueSubmissions[studentId].size;
            return acc;
        }, {});
    }

    // 4. Students (via Enrollments)
    const { data: enrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select('*, students(*)')
        .eq('course_id', courseId)
    
    if (enrollError) console.error("Error fetching enrollments", enrollError);

    if (enrollments) {
        // Transform data to flat structure including status & submission count
        const studentsData = enrollments.map((item: any) => ({
            ...item.students,
            enrollment: item, // Store full enrollment object for logs
            enrollment_status: item.status, // 'active' or 'dropped'
            submission_count: submissionCounts[item.students.student_id] || 0
        }))
        setStudents(studentsData)
    }

    setLoading(false)
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedStudents = [...students].sort((a, b) => {
    if (sortConfig.key === 'submission_count') {
         // Number sort
         if (Number(a[sortConfig.key]) < Number(b[sortConfig.key])) return sortConfig.direction === 'asc' ? -1 : 1;
         if (Number(a[sortConfig.key]) > Number(b[sortConfig.key])) return sortConfig.direction === 'asc' ? 1 : -1;
         return 0;
    }
    // String sort (default)
    const valA = String(a[sortConfig.key] || '').toLowerCase();
    const valB = String(b[sortConfig.key] || '').toLowerCase();
    
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

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

  const handleSavePrompt = async () => {
    if (!editingPromptSession) return
    
    const { error } = await supabase
      .from('sessions')
      .update({ grading_prompt: promptText })
      .eq('session_id', editingPromptSession.session_id)
      
    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
    } else {
      alert('プロンプトを保存しました')
      setEditingPromptSession(null)
      fetchCourseData()
    }
  }

  const handleSaveSystemPrompt = async () => {
      const { error } = await supabase
          .from('courses')
          .update({ system_prompt: systemPromptText })
          .eq('course_id', courseId)
      
      if (error) {
          alert(`保存失敗: ${error.message}`)
      } else {
          alert('システムプロンプトを保存しました')
          setIsSystemPromptOpen(false)
          fetchCourseData()
      }
  }

  const handleBulkEmail = async () => {
    if (!confirm("履修学生全員（Activeのみ）に、現在のレポート未提出状況を通知するメールを一斉送信します。\nよろしいですか？")) return;

    setSendingEmail(true)
    try {
        const { data, error } = await supabase.functions.invoke('send-bulk-email', {
            body: { course_id: courseId }
        })

        if (error) throw error;
        
        alert(`送信完了しました。\n成功: ${data.sent}件\n失敗: ${data.errors?.length || 0}件\n${data.errors?.join('\n') || ''}`);
        fetchCourseData(); // Refresh to show last sent logs
    } catch (e: any) {
        alert('送信エラー: ' + e.message);
        console.error(e);
    } finally {
        setSendingEmail(false);
    }
  }

  const handleIndividualEmail = async (studentId: string, studentName: string) => {
    if (!confirm(`${studentName} さんに、現在のレポート未提出状況を通知するメールを送信しますか？`)) return;

    setSendingEmail(true)
    try {
        const { data, error } = await supabase.functions.invoke('send-bulk-email', {
            body: { course_id: courseId, student_id: studentId }
        })

        if (error) throw error;
        
        if (data.sent > 0) {
            alert(`${studentName} さんへの送信が完了しました。`);
        } else {
            alert(`送信に失敗しました: ${data.errors?.join(', ') || '不明なエラー'}`);
        }
        fetchCourseData(); // Refresh
    } catch (e: any) {
        alert('送信エラー: ' + e.message);
        console.error(e);
    } finally {
        setSendingEmail(false);
    }
  }

    // Smart Term Display
  const getTermLabel = (term: string) => {
      if (term === 'Spring') return '前期'
      if (term === 'Fall') return '後期'
      return term
  }

  if (loading) return <div>コース情報を読み込み中...</div>
  if (!course) return <div>コースが見つかりません</div>

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <Link href="/admin" className="text-blue-500 hover:underline mb-2 block">← ダッシュボードに戻る</Link>
                <h2 className="text-3xl font-bold tracking-tight">{course.title}</h2>
                <p className="text-gray-500">{course.year} {getTermLabel(course.term)}</p>
            </div>
            <div className="flex gap-4 items-center">
                {/* System Prompt Edit Button */}
                 <Button 
                    variant="outline" 
                    onClick={() => {
                        setSystemPromptText(course.system_prompt || '')
                        setIsSystemPromptOpen(true)
                    }}
                 >
                    システムプロンプト設定
                 </Button>

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
                <TabsTrigger value="students">学生一覧 ({students.length})</TabsTrigger>
                <TabsTrigger value="sessions">セッション管理</TabsTrigger>
            </TabsList>
            
            <TabsContent value="students">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>履修学生</CardTitle>
                        <Button 
                            variant="default" 
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={handleBulkEmail}
                            disabled={sendingEmail}
                        >
                            {sendingEmail ? '送信中...' : '📧 レポート状況を一斉送信'}
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead onClick={() => handleSort('student_id')} className="cursor-pointer hover:bg-gray-50">
                                        学籍番号 {sortConfig.key === 'student_id' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-gray-50">
                                        氏名 {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('email')} className="cursor-pointer hover:bg-gray-50">
                                        メールアドレス {sortConfig.key === 'email' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('date')} className="cursor-pointer hover:bg-gray-50">
                                        最終通知
                                    </TableHead>
                                    <TableHead onClick={() => handleSort('submission_count')} className="cursor-pointer hover:bg-gray-50">
                                        提出数 {sortConfig.key === 'submission_count' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                    </TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedStudents.map((student) => (
                                    <TableRow key={student.student_id} className={student.enrollment_status === 'dropped' ? 'bg-gray-100 text-gray-400' : ''}>
                                        <TableCell className="font-medium">{student.student_id}</TableCell>
                                        <TableCell>
                                            {student.name}
                                            {student.enrollment_status === 'dropped' && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Dropped</span>}
                                        </TableCell>
                                        <TableCell>{student.email}</TableCell>
                                        <TableCell className="text-xs text-gray-500">
                                            {student.enrollment?.last_email_sent_at 
                                                ? new Date(student.enrollment.last_email_sent_at).toLocaleString() 
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="text-center font-medium">
                                            {student.submission_count}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleIndividualEmail(student.student_id, student.name)}
                                                    disabled={sendingEmail || student.enrollment_status === 'dropped'}
                                                    title="このユーザーにレポート状況メールを送信"
                                                >
                                                    📧 レポート状況送信
                                                </Button>
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
                            <div className="flex items-center gap-4 flex-wrap">
                                <p className="text-sm text-gray-500 flex-1 min-w-[200px]">
                                    学生はここで生成されたリンクを使用してレポートを提出できます。必要な数だけセッションを追加・削除できます。
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">追加数:</label>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="50" 
                                        value={sessionCount}
                                        onChange={(e) => setSessionCount(parseInt(e.target.value) || 1)}
                                        className="w-20 px-2 py-1 border rounded"
                                    />
                                </div>
                                <Button 
                                    size="sm"
                                    variant="default"
                                    onClick={async () => {
                                        if (!confirm(`${sessionCount}個のセッションを追加しますか？`)) return;
                                        
                                        console.log('Adding sessions for courseId:', courseId);
                                        
                                        const { data: existingSessions, error: fetchError } = await supabase
                                            .from('sessions')
                                            .select('session_number')
                                            .eq('course_id', courseId)
                                            .order('session_number', { ascending: false })
                                            .limit(1);
                                        
                                        if (fetchError) {
                                            console.error('Error fetching existing sessions:', fetchError);
                                            alert(`既存セッション取得エラー: ${fetchError.message}`);
                                            return;
                                        }
                                        
                                        console.log('Existing sessions:', existingSessions);
                                        const maxNum = existingSessions?.[0]?.session_number || 0;
                                        const sessionsToCreate = Array.from({ length: sessionCount }, (_, i) => ({
                                            course_id: courseId,
                                            session_number: maxNum + i + 1,
                                            title: `Lecture ${maxNum + i + 1}`,
                                            allow_late_submission: true
                                        }));

                                        console.log('Sessions to create:', sessionsToCreate);
                                        const { data: insertedData, error } = await supabase.from('sessions').insert(sessionsToCreate).select();
                                        if (error) {
                                            console.error('Insert error:', error);
                                            alert(`エラー: ${error.message}`);
                                        } else {
                                            console.log('Inserted sessions:', insertedData);
                                            alert(`${sessionCount}個のセッションを追加しました (第${maxNum + 1}回〜第${maxNum + sessionCount}回)`);
                                            fetchCourseData();
                                        }
                                    }}
                                >
                                    ➕ セッション追加
                                </Button>
                                <Button 
                                    size="sm"
                                    variant="destructive"
                                    onClick={async () => {
                                        if (sessions.length === 0) {
                                            alert('削除するセッションがありません');
                                            return;
                                        }
                                        const deleteCount = Math.min(sessionCount, sessions.length);
                                        if (!confirm(`最後の${deleteCount}個のセッションを削除しますか？\n\n⚠️ 提出済みのレポートも削除されます。`)) return;
                                        
                                        console.log('Deleting sessions for courseId:', courseId, 'count:', deleteCount);
                                        
                                        const { data: toDelete, error: fetchError } = await supabase
                                            .from('sessions')
                                            .select('session_id, session_number')
                                            .eq('course_id', courseId)
                                            .order('session_number', { ascending: false })
                                            .limit(deleteCount);
                                        
                                        if (fetchError) {
                                            console.error('Error fetching sessions to delete:', fetchError);
                                            alert(`取得エラー: ${fetchError.message}`);
                                            return;
                                        }
                                        
                                        if (!toDelete || toDelete.length === 0) {
                                            console.log('No sessions found to delete');
                                            alert('削除するセッションが見つかりません');
                                            return;
                                        }

                                        console.log('Sessions to delete:', toDelete);
                                        const ids = toDelete.map(s => s.session_id);
                                        console.log('Session IDs to delete:', ids);
                                        
                                        const { data: deletedData, error } = await supabase
                                            .from('sessions')
                                            .delete()
                                            .in('session_id', ids)
                                            .select();
                                        
                                        if (error) {
                                            console.error('Delete error:', error);
                                            alert(`削除エラー: ${error.message}`);
                                        } else {
                                            console.log('Deleted sessions:', deletedData);
                                            alert(`${toDelete.length}個のセッションを削除しました`);
                                            fetchCourseData();
                                        }
                                    }}
                                >
                                    ❌ 最後の{Math.min(sessionCount, sessions.length)}個を削除
                                </Button>
                            </div>


                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-20">回数</TableHead>
                                        <TableHead>タイトル</TableHead>
                                        <TableHead className="w-36">日付</TableHead>
                                        <TableHead className="w-32">プロンプト</TableHead>
                                        <TableHead className="w-40">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map((session) => {
                                        const link = `${window.location.origin}/submit?cid=${courseId}&snum=${session.session_number}`;
                                        
                                        return (
                                            <TableRow key={session.session_id}>
                                                <TableCell className="font-medium">第{session.session_number}回</TableCell>
                                                <TableCell>
                                                    <input
                                                        type="text"
                                                        defaultValue={session.title}
                                                        onBlur={async (e) => {
                                                            const newTitle = e.target.value;
                                                            const { error } = await supabase
                                                                .from('sessions')
                                                                .update({ title: newTitle })
                                                                .eq('session_id', session.session_id);
                                                            
                                                            if (error) {
                                                                console.error('Save error:', error);
                                                                alert(`保存に失敗しました: ${error.message}`);
                                                            } else {
                                                                // Update local state without reloading
                                                                setSessions(prev => prev.map(s => 
                                                                    s.session_id === session.session_id 
                                                                        ? { ...s, title: newTitle } 
                                                                        : s
                                                                ));
                                                            }
                                                        }}
                                                        className="w-full px-2 py-1 border rounded"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2 items-center">
                                                        {/* Manual Year/Month/Day Inputs */}
                                                        <input
                                                            id={`session-year-${session.session_id}`}
                                                            key={`year-${session.session_id}-${session.session_date}`}
                                                            type="number"
                                                            placeholder="年"
                                                            min="2000"
                                                            max="2099"
                                                            onInput={(e) => {
                                                                e.currentTarget.value = e.currentTarget.value.slice(0, 4);
                                                            }}
                                                            defaultValue={session.session_date ? new Date(session.session_date + 'T00:00:00').getFullYear() : ''}
                                                            onBlur={async (e) => {
                                                                const year = e.target.value;
                                                                const monthInput = document.getElementById(`session-month-${session.session_id}`) as HTMLInputElement;
                                                                const dayInput = document.getElementById(`session-day-${session.session_id}`) as HTMLInputElement;
                                                                
                                                                const month = monthInput?.value;
                                                                const day = dayInput?.value;

                                                                if (year && month && day && year.length === 4) {
                                                                    // Date validation
                                                                    const date = new Date(Number(year), Number(month) - 1, Number(day));
                                                                    const isValid = date.getFullYear() === Number(year) && 
                                                                                    date.getMonth() === Number(month) - 1 && 
                                                                                    date.getDate() === Number(day);

                                                                    if (!isValid) {
                                                                        alert('無効な日付です。カレンダーに存在しない日付（例: 2月31日）が入力されています。');
                                                                        return;
                                                                    }

                                                                    const newDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                                                    const { error } = await supabase.from('sessions').update({ session_date: newDate }).eq('session_id', session.session_id);
                                                                    
                                                                    if (error) {
                                                                        console.error('Save error:', error);
                                                                        alert('保存に失敗しました。もう一度お試しください。');
                                                                    } else {
                                                                        setSessions(prev => prev.map(s => 
                                                                            s.session_id === session.session_id 
                                                                                ? { ...s, session_date: newDate } 
                                                                                : s
                                                                        ));
                                                                    }
                                                                }
                                                            }}
                                                            className="w-16 px-2 py-1 border rounded text-center text-sm"
                                                        />
                                                        <span className="text-gray-400">/</span>
                                                        <input
                                                            id={`session-month-${session.session_id}`}
                                                            key={`month-${session.session_id}-${session.session_date}`}
                                                            type="number"
                                                            placeholder="月"
                                                            min="1"
                                                            max="12"
                                                            onInput={(e) => {
                                                                e.currentTarget.value = e.currentTarget.value.slice(0, 2);
                                                            }}
                                                            defaultValue={session.session_date ? String(new Date(session.session_date + 'T00:00:00').getMonth() + 1).padStart(2, '0') : ''}
                                                            onBlur={async (e) => {
                                                                const month = e.target.value.padStart(2, '0');
                                                                const yearInput = document.getElementById(`session-year-${session.session_id}`) as HTMLInputElement;
                                                                const dayInput = document.getElementById(`session-day-${session.session_id}`) as HTMLInputElement;
                                                                
                                                                const year = yearInput?.value;
                                                                const day = dayInput?.value;

                                                                if (year && month && day && parseInt(month) >= 1 && parseInt(month) <= 12) {
                                                                    // Date validation
                                                                    const date = new Date(Number(year), Number(month) - 1, Number(day));
                                                                    const isValid = date.getFullYear() === Number(year) && 
                                                                                    date.getMonth() === Number(month) - 1 && 
                                                                                    date.getDate() === Number(day);

                                                                    if (!isValid) {
                                                                        alert('無効な日付です。カレンダーに存在しない日付（例: 2月31日）が入力されています。');
                                                                        return;
                                                                    }

                                                                    const newDate = `${year}-${month}-${day.padStart(2, '0')}`;
                                                                    const { error } = await supabase.from('sessions').update({ session_date: newDate }).eq('session_id', session.session_id);
                                                                    
                                                                    if (error) {
                                                                        console.error('Save error:', error);
                                                                        alert('保存に失敗しました。もう一度お試しください。');
                                                                    } else {
                                                                        setSessions(prev => prev.map(s => 
                                                                            s.session_id === session.session_id 
                                                                                ? { ...s, session_date: newDate } 
                                                                                : s
                                                                        ));
                                                                    }
                                                                }
                                                            }}
                                                            className="w-12 px-2 py-1 border rounded text-center text-sm"
                                                        />
                                                        <span className="text-gray-400">/</span>
                                                        <input
                                                            id={`session-day-${session.session_id}`}
                                                            key={`day-${session.session_id}-${session.session_date}`}
                                                            type="number"
                                                            placeholder="日"
                                                            min="1"
                                                            max="31"
                                                            onInput={(e) => {
                                                                e.currentTarget.value = e.currentTarget.value.slice(0, 2);
                                                            }}
                                                            defaultValue={session.session_date ? String(new Date(session.session_date + 'T00:00:00').getDate()).padStart(2, '0') : ''}
                                                            onBlur={async (e) => {
                                                                const day = e.target.value.padStart(2, '0');
                                                                const yearInput = document.getElementById(`session-year-${session.session_id}`) as HTMLInputElement;
                                                                const monthInput = document.getElementById(`session-month-${session.session_id}`) as HTMLInputElement;
                                                                
                                                                const year = yearInput?.value;
                                                                const month = monthInput?.value;

                                                                if (year && month && day && parseInt(day) >= 1 && parseInt(day) <= 31) {
                                                                    // Date validation
                                                                    const date = new Date(Number(year), Number(month) - 1, Number(day));
                                                                    const isValid = date.getFullYear() === Number(year) && 
                                                                                    date.getMonth() === Number(month) - 1 && 
                                                                                    date.getDate() === Number(day);

                                                                    if (!isValid) {
                                                                        alert('無効な日付です。カレンダーに存在しない日付（例: 2月31日）が入力されています。');
                                                                        return;
                                                                    }

                                                                    const newDate = `${year}-${month.padStart(2, '0')}-${day}`;
                                                                    const { error } = await supabase.from('sessions').update({ session_date: newDate }).eq('session_id', session.session_id);
                                                                    
                                                                    if (error) {
                                                                        console.error('Save error:', error);
                                                                        alert('保存に失敗しました。もう一度お試しください。');
                                                                    } else {
                                                                        setSessions(prev => prev.map(s => 
                                                                            s.session_id === session.session_id 
                                                                                ? { ...s, session_date: newDate } 
                                                                                : s
                                                                        ));
                                                                    }
                                                                }
                                                            }}
                                                            className="w-12 px-2 py-1 border rounded text-center text-sm"
                                                        />
                                                        
                                                        {/* Weekday Display */}
                                                        {session.session_date && (
                                                            <span className="text-sm text-gray-600 font-medium">
                                                                ({['日', '月', '火', '水', '木', '金', '土'][new Date(session.session_date + 'T00:00:00').getDay()]})
                                                            </span>
                                                        )}
                                                        
                                                        {/* Calendar Picker Button */}
                                                        <div className="relative w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded">
                                                            <span className="text-xl">📅</span>
                                                            <input
                                                                type="date"
                                                                value={session.session_date || ''}
                                                                onChange={async (e) => {
                                                                    const newDate = e.target.value;
                                                                    if (newDate) {
                                                                        const { error } = await supabase.from('sessions').update({ session_date: newDate }).eq('session_id', session.session_id);
                                                                        
                                                                        if (error) {
                                                                            console.error('Save error:', error);
                                                                            alert('保存に失敗しました。もう一度お試しください。');
                                                                        } else {
                                                                            setSessions(prev => prev.map(s => 
                                                                                s.session_id === session.session_id 
                                                                                    ? { ...s, session_date: newDate } 
                                                                                    : s
                                                                            ));
                                                                        }
                                                                    }
                                                                }}
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                title="カレンダーから選択"
                                                            />
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-xs"
                                                        onClick={() => {
                                                            setEditingPromptSession(session)
                                                            setPromptText(session.grading_prompt || '')
                                                    }}
                                                >
                                                    {session.grading_prompt ? 'プロンプト編集済' : 'プロンプト設定'}
                                                </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(link);
                                                            alert(`第${session.session_number}回のリンクをコピーしました`);
                                                        }}
                                                    >
                                                        リンクをコピー
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Prompt Edit Dialog (Session) */}
        <Dialog open={!!editingPromptSession} onOpenChange={(open) => {
            if (!open) setEditingPromptSession(null)
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>採点プロンプト設定 (第{editingPromptSession?.session_number}回)</DialogTitle>
                    <DialogDescription>
                        AI採点時にこのセッション固有の重点項目などを指示できます。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea 
                        value={promptText} 
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder="例: LANとWANの違いについて正しく理解しているか重点的に評価してください。"
                        className="h-32"
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSavePrompt}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* System Prompt Edit Dialog (Course) */}
        <Dialog open={isSystemPromptOpen} onOpenChange={setIsSystemPromptOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>システムプロンプト設定 (コース共通)</DialogTitle>
                    <DialogDescription>
                        このコースの全ての採点に適用されるベースとなるプロンプトです。専門家のロール設定などを記述します。
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Textarea 
                        value={systemPromptText} 
                        onChange={(e) => setSystemPromptText(e.target.value)}
                        placeholder="例: あなたはネットワークの専門家です..."
                        className="h-64"
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleSaveSystemPrompt}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
