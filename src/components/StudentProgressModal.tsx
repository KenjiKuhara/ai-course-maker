'use client'

import { useState, useEffect } from 'react'
import { ApiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supabase } from '@/lib/supabase'

interface StudentProgressModalProps {
    student: any;
    sessions: any[];
    courseId: string;
}

export function StudentProgressModal({ student, sessions, courseId }: StudentProgressModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [submissions, setSubmissions] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchSubmissions()
        }
    }, [isOpen])

    const fetchSubmissions = async () => {
        setLoading(true)
        // Fetch all submissions for this student in this course (via sessions)
        const sessionIds = sessions.map(s => s.session_id)
        if (sessionIds.length === 0) {
            setLoading(false)
            return
        }

        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .eq('student_id', student.student_id)
            .in('session_id', sessionIds)
        
        if (error) {
            console.error('Error fetching student submissions:', error)
        } else {
            setSubmissions(data || [])
        }
        setLoading(false)
    }

    const getStatusOverride = (session: any, submission: any) => {
        if (!submission) return 'missing'
        return submission.status || 'pending'
    }

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
            return <Badge variant="secondary" className="text-gray-500">未提出</Badge>
          default:
            return <Badge variant="secondary">{status}</Badge>
        }
    }

    const [sending, setSending] = useState(false)

    // Prepare data: Map sessions to submissions
    const progressData = sessions.map(session => {
        // Find latest submission for this session
        const sessionSubmissions = submissions.filter(s => s.session_id === session.session_id)
        // Sort by submitted_at desc
        sessionSubmissions.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
        const latest = sessionSubmissions[0]

        return {
            session,
            submission: latest,
            status: latest ? (latest.status || 'pending') : 'missing'
        }
    })

    const handleEmailClick = async () => {
         if (!confirm(`${student.name} さんに、現在のレポート状況をメールで送信しますか？`)) return;

         setSending(true);
         try {
             // Use the same Edge Function as bulk email for consistency
             const { data, error } = await supabase.functions.invoke('send-bulk-email', {
                 body: { 
                    course_id: courseId,
                    student_id: student.student_id 
                 }
             });

             if (error) throw error;
             
             if (data.sent > 0) {
                 alert('送信しました。');
             } else {
                 alert(`送信失敗: ${data.errors?.join(', ') || '不明なエラー'}`);
             }

         } catch (e: any) {
             console.error(e);
             alert('送信エラー: ' + e.message);
         } finally {
             setSending(false);
         }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" title="進捗状況を確認">
                    📊 状況確認
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{student.name} さんの進捗状況 ({student.student_id})</DialogTitle>
                </DialogHeader>
                
                <div className="flex justify-end mb-2">
                     <Button size="sm" variant="outline" onClick={handleEmailClick} disabled={sending}>
                        {sending ? '送信中...' : '📧 レポート状況送信'}
                     </Button>
                </div>

                <ScrollArea className="flex-1">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">回</TableHead>
                                <TableHead>セッション名</TableHead>
                                <TableHead>ステータス</TableHead>
                                <TableHead>スコア</TableHead>
                                <TableHead>提出日時</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center">読み込み中...</TableCell>
                                </TableRow>
                            ) : progressData.map((item) => (
                                <TableRow key={item.session.session_id}>
                                    <TableCell className="font-medium">第{item.session.session_number}回</TableCell>
                                    <TableCell>{item.session.title}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={item.status} />
                                    </TableCell>
                                    <TableCell>
                                        {item.submission?.score !== undefined ? `${item.submission.score}点` : '-'}
                                    </TableCell>
                                    <TableCell>
                                        {item.submission ? new Date(item.submission.submitted_at).toLocaleString('ja-JP') : '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
