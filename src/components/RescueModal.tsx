'use client'

import { useState } from 'react'
import { ApiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { QRCodeSVG } from 'qrcode.react'

export function RescueModal({ studentId, studentName }: { studentId: string, studentName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchKey = async () => {
    if (key) return
    setLoading(true)
    setError(null)
    try {
        const { data, error } = await ApiClient.getRescueKey(studentId)
        if (error) throw new Error(error.message || 'Failed to fetch key')
        setKey(data.key)
    } catch (e: any) {
        setError(e.message)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open)
        if (open) fetchKey()
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">👁️ Rescue</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rescue Key for {studentName}</DialogTitle>
          <DialogDescription>
            Show this to the student to allow them to login immediately.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 py-4">
            {loading && <p>Loading secure key...</p>}
            {error && <p className="text-red-500">{error}</p>}
            
            {key && (
                <>
                    <div className="text-3xl font-mono bg-gray-100 p-4 rounded border select-all">
                        {key}
                    </div>
                    <div className="p-4 bg-white border rounded shadow-sm">
                        <QRCodeSVG value={key} size={200} />
                        <p className="text-center text-xs text-gray-400 mt-2">Scan to Copy</p>
                    </div>
                    <Button onClick={() => navigator.clipboard.writeText(key)} variant="secondary">
                        Copy to Clipboard
                    </Button>
                </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
