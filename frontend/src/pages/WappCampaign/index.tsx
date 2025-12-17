import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

interface Session {
  id: number
  sessionName: string
  status: string
}

export default function WappCampaign() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<number | null>(null)
  const [numbers, setNumbers] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ sent: 0, total: 0 })

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await api.get('/whatsapp/sessions')
      const activeSessions = response.data.filter((s: Session) => s.status === 'connected')
      setSessions(activeSessions)
      if (activeSessions.length > 0) {
        setSelectedSession(activeSessions[0].id)
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleSend = async () => {
    if (!selectedSession) {
      toast.error('Please select a WhatsApp session')
      return
    }

    if (!numbers.trim()) {
      toast.error('Please enter phone numbers')
      return
    }

    if (!message.trim()) {
      toast.error('Please enter a message')
      return
    }

    const phoneNumbers = numbers
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n)

    if (phoneNumbers.length === 0) {
      toast.error('No valid phone numbers')
      return
    }

    setLoading(true)
    setProgress({ sent: 0, total: phoneNumbers.length })

    try {
      for (let i = 0; i < phoneNumbers.length; i++) {
        try {
          await api.post(`/whatsapp/sessions/${selectedSession}/send`, {
            recipient: phoneNumbers[i],
            message,
          })
          setProgress({ sent: i + 1, total: phoneNumbers.length })
        } catch (error) {
          console.error(`Failed to send to ${phoneNumbers[i]}`)
        }

        if (i < phoneNumbers.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }

      toast.success('Messages sent successfully!')
      setNumbers('')
      setMessage('')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send messages')
    } finally {
      setLoading(false)
      setProgress({ sent: 0, total: 0 })
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Wapp Campaign</h1>

      <div className="card">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select WhatsApp Session:
          </label>
          {sessions.length === 0 ? (
            <p className="text-red-500">No active WhatsApp sessions. Please register one first.</p>
          ) : (
            <select
              value={selectedSession || ''}
              onChange={(e) => setSelectedSession(Number(e.target.value))}
              className="w-full md:w-72 px-4 py-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.sessionName}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Numbers (one per line):
            </label>
            <textarea
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              className="input h-64 resize-none"
              placeholder="919876543210&#10;919876543211&#10;919876543212"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message:
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input h-64 resize-none"
              placeholder="Enter your message here..."
            />
          </div>
        </div>

        {loading && progress.total > 0 && (
          <div className="mt-4">
            <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: `${(progress.sent / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-center mt-2 text-gray-600">
              Sent {progress.sent} of {progress.total} messages
            </p>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleSend}
            disabled={loading || sessions.length === 0}
            className="btn-success px-8"
          >
            {loading ? 'Sending...' : 'Send Messages'}
          </button>
        </div>
      </div>
    </div>
  )
}
