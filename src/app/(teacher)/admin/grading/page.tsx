'use client'

import { useEffect, useState, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'

function GradingContent() {
  const searchParams = useSearchParams()
  const courseId = searchParams.get('id')

  const [courseTitle, setCourseTitle] = useState('Loading...')
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSessionNum, setSelectedSessionNum] = useState<string>('1')
  
  // Data for the table
  const [gradingData, setGradingData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Filter Counts
  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, ai_graded: 0, approved: 0, rejected: 0, missing: 0 }
    gradingData.forEach(item => {
      c.all++
      const s = item.status as keyof typeof c
      if (c[s] !== undefined) c[s]++
    })
    return c
  }, [gradingData])

  const filteredData = useMemo(() => {
    if (filterStatus === 'all') return gradingData
    return gradingData.filter(item => item.status === filterStatus)
  }, [gradingData, filterStatus])

  // History Modal
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<any>(null)
  
  // Prompt Modal
  const [promptOpen, setPromptOpen] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState('')

  // Email Modal
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailText, setEmailText] = useState('')

  // Detail/Approval Modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)
  const [teacherComment, setTeacherComment] = useState('')
  const [scoreOverride, setScoreOverride] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

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
    
    // 1. Fetch All Students (Active & Dropped)
    const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, students(*)')
        .eq('course_id', courseId)
    
    // 2. Fetch Submissions for this Session
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
            .select('*, sessions(*)')
            .eq('session_id', validSessionId)
            .order('submitted_at', { ascending: false })
        submissions = subData || []
    }

    // 3. Merge Data
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
                status: latestSubmission ? (latestSubmission.status || 'pending') : 'missing',
                submissionCount: studentSubmissions.length
            }
        })
        
        merged.sort((a: any, b: any) => a.student.student_id.localeCompare(b.student.student_id))
        setGradingData(merged)
    }

    setLoading(false)
  }

  const getFileUrl = (path: string) => {
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/submissions/${path}`
  }

  // Status Badge Component
  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">AI採点中</Badge>
      case 'ai_graded':
        return <Badge className="bg-blue-500 hover:bg-blue-600">確認待ち</Badge>
      case 'approved':
        return <Badge className="bg-green-600 hover:bg-green-700">承認済み</Badge>
      case 'rejected':
        return <Badge variant="destructive">却下</Badge>
      case 'missing':
        return <Badge variant="destructive">未提出</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Trigger AI Grading
  const triggerAiGrading = async (submissionId: string) => {
    setActionLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-grade', {
        body: { submission_id: submissionId }
      })
      if (error) {
        console.error('AI Grading Error:', error, data)
        throw new Error(error.message + (data?.error ? ': ' + data.error : ''))
      }
      console.log('AI Grading Success:', data)
      await fetchGradingData()
    } catch (e: any) {
      console.error('Full error:', e)
      alert('AI採点エラー: ' + e.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Open detail modal
  const openDetailModal = (item: any) => {
    setSelectedSubmission(item)
    setTeacherComment(item.latestSubmission?.teacher_comment || '')
    setScoreOverride(item.latestSubmission?.score?.toString() || '')
    setDetailOpen(true)
  }

  // Approve/Reject submission
  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!selectedSubmission?.latestSubmission) return
    
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('teacher-approve', {
        body: {
          submission_id: selectedSubmission.latestSubmission.id,
          action,
          teacher_comment: teacherComment,
          score_override: scoreOverride ? parseInt(scoreOverride) : undefined
        }
      })
      if (error) throw error
      
      setDetailOpen(false)
      await fetchGradingData()
    } catch (e: any) {
      alert('エラー: ' + e.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Generate Email Text
  const generateEmail = (submission: any) => {
    if (!submission?.latestSubmission) return

    const studentName = submission.student.name;
    const score = submission.latestSubmission.score;
    const feedbackRaw = submission.latestSubmission.ai_feedback;
    
    let feedbackBody = "";
    
    try {
        // Try parsing as JSON (New format)
        const data = JSON.parse(feedbackRaw);
        
        feedbackBody += `【総合得点】 ${score}点\n\n`;
        feedbackBody += `【総評】\n${data.summary}\n\n`;
        
        if (data.details) {
             feedbackBody += `【詳細評価】\n`;
             Object.entries(data.details).forEach(([key, value]) => {
                 feedbackBody += `・${key}: ${value}\n`;
             });
             feedbackBody += `\n`;
        }
        
        if (data.advice) {
            feedbackBody += `【今後のアドバイス】\n${data.advice}\n`;
        }
        
    } catch (e) {
        // Fallback for old textual feedback
        feedbackBody += `【評価結果】 ${score}点\n\n`;
        feedbackBody += `【コメント】\n${feedbackRaw}\n`;
    }

    const emailTemplate = `件名: レポート採点結果のお知らせ

${studentName} さん

提出いただいたレポートの採点が完了しました。

${feedbackBody}
--------------------------------------------------
また、次回の課題も頑張ってください。

担当教員より`;

    setEmailText(emailTemplate);
    setEmailOpen(true);
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
             <div>
                <Link href={`/admin/course-detail?id=${courseId}`} className="text-blue-500 hover:underline mb-2 block">← コース詳細に戻る</Link>
                <h2 className="text-3xl font-bold tracking-tight">採点・評価: {courseTitle}</h2>
            </div>
            <div className="flex items-center gap-2">
                <span className="font-medium">セッション:</span>
                <Select value={selectedSessionNum} onValueChange={setSelectedSessionNum}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="セッションを選択" />
                    </SelectTrigger>
                    <SelectContent>
                        {Array.from({length: 15}, (_, i) => i + 1).map(num => (
                            <SelectItem key={num} value={num.toString()}>
                                第{num}回 {sessions.find(s => s.session_number === num)?.title ? `- ${sessions.find(s => s.session_number === num)?.title}` : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>第{selectedSessionNum}回 提出状況一覧</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                    <Button 
                        variant={filterStatus === 'all' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('all')}
                    >
                        全て ({counts.all})
                    </Button>
                    <Button 
                        variant={filterStatus === 'approved' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('approved')}
                        className={filterStatus === 'approved' ? "bg-green-600 hover:bg-green-700 border-transparent text-white" : "text-green-600 border-green-200 hover:bg-green-50"}
                    >
                        承認済み ({counts.approved})
                    </Button>
                    <Button 
                        variant={filterStatus === 'ai_graded' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('ai_graded')}
                        className={filterStatus === 'ai_graded' ? "bg-amber-500 hover:bg-amber-600 border-transparent text-white" : "text-amber-600 border-amber-200 hover:bg-amber-50"}
                    >
                        AI採点中 ({counts.ai_graded})
                    </Button>
                    <Button 
                        variant={filterStatus === 'pending' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('pending')}
                        className={filterStatus === 'pending' ? "bg-blue-500 hover:bg-blue-600 border-transparent text-white" : "text-blue-600 border-blue-200 hover:bg-blue-50"}
                    >
                        採点中 ({counts.pending})
                    </Button>
                    <Button 
                        variant={filterStatus === 'rejected' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('rejected')}
                        className={filterStatus === 'rejected' ? "bg-rose-500 hover:bg-rose-600 border-transparent text-white" : "text-rose-600 border-rose-200 hover:bg-rose-50"}
                    >
                        却下 ({counts.rejected})
                    </Button>
                     <Button 
                        variant={filterStatus === 'missing' ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setFilterStatus('missing')}
                        className={filterStatus === 'missing' ? "bg-slate-500 hover:bg-slate-600 border-transparent text-white" : "text-slate-600 border-slate-200 hover:bg-slate-50"}
                    >
                        未提出 ({counts.missing})
                    </Button>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>学籍番号</TableHead>
                            <TableHead>氏名</TableHead>
                            <TableHead>ステータス</TableHead>
                            <TableHead>点数</TableHead>
                            <TableHead>最新ファイル</TableHead>
                            <TableHead>提出日時</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center">読み込み中...</TableCell></TableRow>
                        ) : filteredData.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">該当するデータはありません</TableCell></TableRow>
                        ) : filteredData.map((item) => (
                            <TableRow key={item.student.student_id} className={item.enrollment.status === 'dropped' ? 'opacity-50 bg-gray-50' : ''}>
                                <TableCell className="font-medium">{item.student.student_id}</TableCell>
                                <TableCell>
                                    {item.student.name}
                                    {item.enrollment.status === 'dropped' && <Badge variant="secondary" className="ml-2">取下</Badge>}
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={item.status} />
                                    {item.latestSubmission?.is_late && <Badge variant="outline" className="ml-2 text-red-500 border-red-500">遅刻</Badge>}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission?.score !== null && item.latestSubmission?.score !== undefined ? (
                                        <span className={`font-bold ${item.latestSubmission.score >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                                            {item.latestSubmission.score}点
                                        </span>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission ? (
                                        <a 
                                            href={getFileUrl(item.latestSubmission.file_url)} 
                                            target="_blank" 
                                            className="text-blue-600 underline text-sm"
                                            download
                                        >
                                            ダウンロード ({item.latestSubmission.original_filename ? item.latestSubmission.original_filename.substring(0, 15) + (item.latestSubmission.original_filename.length > 15 ? '...' : '') : '最新'})
                                        </a>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {item.latestSubmission ? new Date(item.latestSubmission.submitted_at).toLocaleString('ja-JP') : '-'}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        {item.latestSubmission && (
                                            <>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm"
                                                    onClick={() => openDetailModal(item)}
                                                >
                                                    詳細
                                                </Button>
                                                {(item.status === 'pending' || item.status === 'ai_graded') && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => triggerAiGrading(item.latestSubmission.id)}
                                                        disabled={actionLoading}
                                                    >
                                                        再採点
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => {
                                                setSelectedStudentHistory(item)
                                                setHistoryOpen(true)
                                            }}
                                            disabled={item.submissionCount === 0}
                                        >
                                            履歴 ({item.submissionCount})
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        {/* Detail/Approval Modal */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        採点詳細: {selectedSubmission?.student.name} ({selectedSubmission?.student.student_id})
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {/* AI Feedback Section */}
                    <div className="p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold text-blue-800 mb-2">🤖 AI採点結果</h4>
                        <div className="flex items-center gap-4 mb-2">
                            <span className="text-2xl font-bold text-blue-600">
                                {selectedSubmission?.latestSubmission?.score ?? '-'}点
                            </span>
                            <StatusBadge status={selectedSubmission?.status || 'pending'} />
                            {selectedSubmission?.latestSubmission?.executed_prompt && (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                        setSelectedPrompt(selectedSubmission.latestSubmission.executed_prompt)
                                        setPromptOpen(true)
                                    }}
                                >
                                    👀 プロンプト確認
                                </Button>
                            )}
                            {selectedSubmission?.latestSubmission?.ai_feedback && (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => generateEmail(selectedSubmission)}
                                >
                                    📧 メール作成
                                </Button>
                            )}
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto mt-2">
                             {(() => {
                                try {
                                    const data = JSON.parse(selectedSubmission?.latestSubmission?.ai_feedback || '{}');
                                    // If parsing succeeds and has summary/details structure
                                    if(data.summary) {
                                        return (
                                            <div className="space-y-2">
                                                <p className="font-bold">{data.summary}</p>
                                                {data.details && (
                                                    <div className="pl-4 border-l-2 border-blue-200">
                                                        {Object.entries(data.details).map(([k, v]) => (
                                                            <div key={k} className="mb-1">
                                                                <span className="font-semibold">{k}:</span> {v as string}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {data.advice && (
                                                    <div className="mt-2 text-blue-800 bg-blue-100 p-2 rounded">
                                                        💡 {data.advice}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    }
                                    return selectedSubmission?.latestSubmission?.ai_feedback;
                                } catch (e) {
                                    return selectedSubmission?.latestSubmission?.ai_feedback || 'AI採点結果がありません';
                                }
                             })()}
                        </div>
                    </div>

                    {/* Teacher Override Section */}
                    <div className="space-y-3">
                        <h4 className="font-semibold">👩‍🏫 先生の評価</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="score-override">スコア修正 (0-100)</Label>
                                <input
                                    id="score-override"
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={scoreOverride}
                                    onChange={(e) => setScoreOverride(e.target.value)}
                                    className="w-full mt-1 p-2 border rounded-md"
                                    placeholder={selectedSubmission?.latestSubmission?.score?.toString() || ''}
                                />
                            </div>
                            <div>
                                <Label>ファイル</Label>
                                {selectedSubmission?.latestSubmission && (
                                    <a 
                                        href={getFileUrl(selectedSubmission.latestSubmission.file_url)} 
                                        target="_blank" 
                                        className="block mt-1 text-blue-600 underline"
                                        download
                                    >
                                        📎 {selectedSubmission.latestSubmission.original_filename || 'Download'}
                                    </a>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="teacher-comment">先生からのコメント</Label>
                            <textarea
                                id="teacher-comment"
                                value={teacherComment}
                                onChange={(e) => setTeacherComment(e.target.value)}
                                className="w-full mt-1 p-2 border rounded-md h-24"
                                placeholder="学生へのフィードバックを入力..."
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setDetailOpen(false)}
                    >
                        キャンセル
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => handleApproval('reject')}
                        disabled={actionLoading}
                    >
                        却下（再提出要求）
                    </Button>
                    <Button
                        onClick={() => handleApproval('approve')}
                        disabled={actionLoading}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        承認
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

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
                                <TableHead>Status</TableHead>
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
                                    <TableCell>{sub.score ?? '-'}</TableCell>
                                    <TableCell><StatusBadge status={sub.status || 'pending'} /></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </DialogContent>
        </Dialog>

        {/* Prompt Modal */}
        <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>AI使用プロンプト</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh] w-full rounded-md border p-4 bg-muted/50">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                        {selectedPrompt}
                    </pre>
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={() => setPromptOpen(false)}>閉じる</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Email Modal */}
        <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>学生への通知メール（下書き）</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <textarea 
                        className="w-full h-[400px] p-4 border rounded-md font-mono text-sm"
                        value={emailText}
                        onChange={(e) => setEmailText(e.target.value)}
                    />
                </div>
                <DialogFooter>
                     <Button 
                        variant="default"
                        onClick={() => {
                            navigator.clipboard.writeText(emailText);
                            alert("コピーしました！");
                        }}
                    >
                        📋 コピーする
                    </Button>
                    <Button variant="outline" onClick={() => setEmailOpen(false)}>閉じる</Button>
                </DialogFooter>
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
