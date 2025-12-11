'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'

interface Course {
  course_id: string
  title: string
  year: number
  term: string
  teacher_id: string
  created_at: string
  system_prompt: string
}

interface CourseTemplate {
  id: string
  keyword: string
  system_prompt: string
}

export default function AdminDashboard() {
  const [courses, setCourses] = useState<Course[]>([])
  const [templates, setTemplates] = useState<CourseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  
  // New Course State
  const [newTitle, setNewTitle] = useState('')
  
  // Smart Defaults for Registration
  const getSmartDefaults = () => {
    const now = new Date()
    const month = now.getMonth() // 0-11
    const year = now.getFullYear()
    
    // July (6) starts the default for Fall
    const isFall = month >= 6 
    
    return {
      year: year.toString(),
      term: isFall ? 'Fall' : 'Spring'
    }
  }

  const [defaults] = useState(getSmartDefaults())
  const [newYear, setNewYear] = useState(defaults.year)
  const [newTerm, setNewTerm] = useState(defaults.term)

  // Template Management State
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [newSystemPrompt, setNewSystemPrompt] = useState('')

  useEffect(() => {
    fetchCourses()
    fetchTemplates()
  }, [])

  const fetchCourses = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('teacher_id', user.id)
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (data) setCourses(data)
    setLoading(false)
  }

  const fetchTemplates = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('course_templates')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
    
    if (data) setTemplates(data)
  }

  const handleCreateTemplate = async () => {
      console.log("Attempting to create template...");
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
          console.error("User not found:", authError);
          alert("ログインユーザーが見つかりません。再ログインしてください。");
          return;
      }

      console.log("User found:", user.id);
      
      const { error } = await supabase.from('course_templates').insert({
          teacher_id: user.id,
          keyword: newKeyword,
          system_prompt: newSystemPrompt
      })

      if (error) {
          console.error("Insert error:", error);
          alert(`テンプレート作成エラー: ${error.message}`)
      } else {
          setNewKeyword('')
          setNewSystemPrompt('')
          fetchTemplates()
          alert('テンプレートを作成しました')
      }
  }
  
  const handleDeleteTemplate = async (id: string) => {
      if (!confirm('本当に削除しますか？')) return
      const { error } = await supabase.from('course_templates').delete().eq('id', id)
      if (!error) fetchTemplates()
  }

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check for matching template
    let systemPrompt = ""
    const matchedTemplate = templates.find(t => newTitle.includes(t.keyword))
    if (matchedTemplate) {
        systemPrompt = matchedTemplate.system_prompt
        console.log(`Matched template: ${matchedTemplate.keyword}`)
    }

    const { error } = await supabase.from('courses').insert({
      teacher_id: user.id,
      title: newTitle,
      year: parseInt(newYear),
      term: newTerm,
      system_prompt: systemPrompt
    })

    if (!error) {
      setNewTitle('')
      fetchCourses()
      if (matchedTemplate) {
          // Notify user that template was applied
          // (You might want a toast here, but simple alert or silence is fine for now, user asked for it to just happen)
          // Let's show a subtle visual cue or just done.
      }
    }
  }

  const handleDeleteCourse = async (courseId: string, courseTitle: string) => {
      if (!confirm(`「${courseTitle}」を削除しますか？\n(注意: 登録されている学生やセッション、提出物も全て削除されます)`)) return
      
      const { error } = await supabase.from('courses').delete().eq('course_id', courseId)
      
      if (error) {
          alert(`削除失敗: ${error.message}`)
      } else {
          fetchCourses()
      }
  }

  return (
    <div className="space-y-8">
       <div className="flex justify-between items-center">
         <h2 className="text-3xl font-bold tracking-tight">ダッシュボード</h2>
         <div className="flex gap-2">
             <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)}>
                 システムプロンプト設定 (テンプレート)
             </Button>
         </div>
       </div>

       {/* Template Management Dialog */}
        {isTemplateDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>システムプロンプト設定</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setIsTemplateDialogOpen(false)}>✕</Button>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4 border p-4 rounded bg-gray-50">
                            <h3 className="font-semibold text-sm">新規テンプレート作成</h3>
                            <div className="grid gap-2">
                                <Label>キーワード (例: ネットワーク)</Label>
                                <Input 
                                    value={newKeyword} 
                                    onChange={e => setNewKeyword(e.target.value)} 
                                    placeholder="コース名に含まれるキーワード"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>適用するシステムプロンプト (ベース評価基準)</Label>
                                <Textarea 
                                    value={newSystemPrompt} 
                                    onChange={e => setNewSystemPrompt(e.target.value)} 
                                    placeholder="例: あなたはネットワークスペシャリストです。技術的な正確さを重視して採点してください..."
                                    className="h-32"
                                />
                            </div>
                            <Button onClick={handleCreateTemplate} disabled={!newKeyword || !newSystemPrompt}>登録</Button>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">登録済みテンプレート</h3>
                            <div className="space-y-2">
                                {templates.map(t => (
                                    <div key={t.id} className="flex justify-between items-start border p-3 rounded bg-white">
                                        <div>
                                            <div className="font-bold text-sm">キーワード: {t.keyword}</div>
                                            <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-2">{t.system_prompt}</div>
                                        </div>
                                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteTemplate(t.id)}>削除</Button>
                                    </div>
                                ))}
                                {templates.length === 0 && <p className="text-sm text-gray-500">テンプレートはありません。</p>}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

       {/* Create Course Form */}
       <Card>
         <CardContent className="pt-6">
           <h3 className="font-semibold mb-4">新規コース作成</h3>
           <form onSubmit={handleCreateCourse} className="flex gap-4 items-end">
             <div className="grid w-full items-center gap-1.5">
               <Label htmlFor="title">コース名</Label>
               <Input 
                 id="title" 
                 value={newTitle}
                 onChange={(e) => setNewTitle(e.target.value)}
                 required
               />
             </div>
             
             <div className="grid w-[100px] items-center gap-1.5">
                <Label htmlFor="year">年度</Label>
                <Input
                     id="year"
                     type="number"
                     value={newYear}
                     onChange={(e) => setNewYear(e.target.value)}
                     required
                />
             </div>

             <div className="grid w-[120px] items-center gap-1.5">
                 <Label htmlFor="term">学期</Label>
                 <Select value={newTerm} onValueChange={setNewTerm}>
                     <SelectTrigger>
                         <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                         <SelectItem value="Spring">前期</SelectItem>
                         <SelectItem value="Fall">後期</SelectItem>
                     </SelectContent>
                 </Select>
             </div>

             <Button type="submit">作成</Button>
           </form>
         </CardContent>
       </Card>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {courses.map((course) => (
           <Card key={course.course_id} className="hover:shadow-lg transition-shadow relative group h-full flex flex-col justify-between">
             <Link href={`/admin/course-detail?id=${course.course_id}`} className="block h-full">
                 <CardHeader>
                   <CardTitle>{course.title}</CardTitle>
                   <div className="text-sm text-gray-500">
                     {course.year} {course.term === 'Spring' ? '前期' : course.term === 'Fall' ? '後期' : course.term}
                   </div>
                   {course.system_prompt && (
                       <div className="mt-2 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded inline-block">
                           Template Applied
                       </div>
                   )}
                 </CardHeader>
             </Link>
             <Button
                 variant="ghost" 
                 size="icon" 
                 className="absolute top-2 right-2 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all z-10"
                 onClick={(e) => {
                     e.stopPropagation() // Prevent navigating to detail
                     handleDeleteCourse(course.course_id, course.title)
                 }}
             >
                 <Trash2 className="h-4 w-4" />
             </Button>
           </Card>
         ))}
         {courses.length === 0 && !loading && (
           <div className="col-span-full text-center text-gray-500 py-12 bg-white rounded-lg shadow-sm border">
             コースが見つかりません。新しいコースを作成してください。
           </div>
         )}
         {loading && <div>読み込み中...</div>}
       </div>
    </div>
  )
}
