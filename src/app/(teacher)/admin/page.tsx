'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Course {
  course_id: string
  title: string
  year: number
  term: string
}

export default function AdminDashboard() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString())
  const [newTerm, setNewTerm] = useState('Spring')

  useEffect(() => {
    fetchCourses()
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

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('courses').insert({
      teacher_id: user.id,
      title: newTitle,
      year: parseInt(newYear),
      term: newTerm
    })

    if (!error) {
      setNewTitle('')
      fetchCourses()
    }
  }

  return (
    <div className="space-y-8">
       <div className="flex justify-between items-center">
         <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
       </div>

       {/* Create Course Form */}
       <Card>
         <CardHeader>
           <CardTitle>Create New Course</CardTitle>
         </CardHeader>
         <CardContent>
           <form onSubmit={handleCreateCourse} className="flex gap-4 items-end">
             <div className="grid w-full max-w-sm items-center gap-1.5">
               <Label htmlFor="title">Course Title</Label>
               <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} required />
             </div>
             <div className="grid w-full max-w-[100px] items-center gap-1.5">
               <Label htmlFor="year">Year</Label>
               <Input id="year" type="number" value={newYear} onChange={e => setNewYear(e.target.value)} required />
             </div>
             <div className="grid w-full max-w-[100px] items-center gap-1.5">
               <Label htmlFor="term">Term</Label>
               <Input id="term" value={newTerm} onChange={e => setNewTerm(e.target.value)} required />
             </div>
             <Button type="submit">Create</Button>
           </form>
         </CardContent>
       </Card>

       {/* Course List */}
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map(course => (
            <Link key={course.course_id} href={`/admin/course-detail?id=${course.course_id}`}>
              <Card className="hover:bg-gray-50 cursor-pointer transition-colors">
                <CardHeader>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription>{course.year} {course.term}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
          {courses.length === 0 && !loading && (
            <p className="text-gray-500">No courses found.</p>
          )}
       </div>
    </div>
  )
}
