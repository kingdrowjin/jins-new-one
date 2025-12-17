import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { FaWhatsapp, FaTrash, FaSync } from 'react-icons/fa'

interface Session {
  id: number
  sessionName: string
  status: string
  phoneNumber: string | null
  createdAt: string
}

export default function WAppChannel() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await api.get('/whatsapp/sessions')
      setSessions(response.data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteSession = async (sessionId: number) => {
    if (!confirm('Are you sure you want to delete this session?')) return

    try {
      await api.delete(`/whatsapp/sessions/${sessionId}`)
      toast.success('Session deleted successfully')
      loadSessions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete session')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">WApp Channel</h1>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Connected WhatsApp Sessions</h2>
          <button
            onClick={loadSessions}
            className="flex items-center gap-2 text-primary-500 hover:text-primary-600"
          >
            <FaSync />
            Refresh
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <FaWhatsapp className="text-6xl text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No WhatsApp sessions registered</p>
            <a href="/register-wapp" className="text-primary-500 hover:underline">
              Register a new session
            </a>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      session.status === 'connected' ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    <FaWhatsapp
                      className={`text-2xl ${
                        session.status === 'connected' ? 'text-green-500' : 'text-gray-400'
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">{session.sessionName}</h3>
                    <p className="text-sm text-gray-500">
                      {session.phoneNumber || 'No phone number'}
                    </p>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`badge ${
                      session.status === 'connected'
                        ? 'badge-success'
                        : session.status === 'pending'
                        ? 'badge-warning'
                        : 'badge-danger'
                    }`}
                  >
                    {session.status}
                  </span>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="text-red-500 hover:text-red-600 p-2"
                    title="Delete session"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
