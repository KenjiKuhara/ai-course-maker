
import { supabase } from './supabase'

export class ApiClient {
  static async registerStudent(data: { student_id: string; name: string; email: string; course_ids?: string[] }) {
    return await supabase.functions.invoke('register-student', { body: data })
  }

  static async getRescueKey(studentId: string) {
    // Requires Auth (Teacher) - Handled automatically if supabase client has session
    return await supabase.functions.invoke('teacher-rescue-key', { body: { student_id: studentId } })
  }

  static async submitReport(data: { student_id: string; access_key: string; file_path: string; course_id: string; session_id: string }) {
    return await supabase.functions.invoke('submit-report', { body: data })
  }

  static async resetStudentEmail(studentId: string) {
    return await supabase.functions.invoke('reset-student-email', { body: { student_id: studentId } })
  }

  static async toggleEnrollmentStatus(studentId: string, courseId: string) {
    return await supabase.functions.invoke('toggle-enrollment-status', { body: { student_id: studentId, course_id: courseId } })
  }
}
