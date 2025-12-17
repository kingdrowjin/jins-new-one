import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { connectSocket, disconnectSocket } from '../../services/socket'
import toast from 'react-hot-toast'
import { FaWhatsapp, FaTimes } from 'react-icons/fa'

interface Session {
  id: number
  sessionName: string
  status: string
  phoneNumber: string | null
  createdAt: string
}

export default function RegisterWAPP() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionName, setSessionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [, setCurrentSessionId] = useState<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('')

  useEffect(() => {
    loadSessions()
    return () => {
      disconnectSocket()
    }
  }, [])

  const loadSessions = async () => {
    try {
      const response = await api.get('/whatsapp/sessions')
      setSessions(response.data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const createSession = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/whatsapp/sessions', {
        sessionName: sessionName.trim(),
      })

      const session = response.data.session
      setCurrentSessionId(session.id)
      setShowQRModal(true)
      setConnectionStatus('Initializing...')

      const socket = connectSocket(user!.id)

      socket.on('qr', (data: { qr: string; sessionId: number }) => {
        if (data.sessionId === session.id) {
          setQrCode(data.qr)
          setConnectionStatus('Scan QR Code with WhatsApp')
        }
      })

      socket.on('status', (data: { status: string; sessionId: number; phoneNumber?: string }) => {
        if (data.sessionId === session.id) {
          if (data.status === 'authenticated') {
            setConnectionStatus('Authenticating...')
          } else if (data.status === 'ready') {
            setConnectionStatus('Connected!')
            toast.success('WhatsApp connected successfully!')
            setTimeout(() => {
              setShowQRModal(false)
              loadSessions()
            }, 2000)
          } else if (data.status === 'auth_failure') {
            setConnectionStatus('Authentication failed')
            toast.error('Authentication failed')
          } else if (data.status === 'disconnected') {
            setConnectionStatus('Disconnected')
          }
        }
      })

      socket.on('error', (data: { message: string; sessionId: number }) => {
        if (data.sessionId === session.id) {
          toast.error(data.message)
          setConnectionStatus('Error: ' + data.message)
        }
      })

      socket.emit('initSession', { sessionId: session.id, userId: user!.id })
      setSessionName('')
      loadSessions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  const deleteSession = async (sessionId: number) => {
    if (!confirm('Are you sure you want to delete this session?')) return

    try {
      await api.delete(`/whatsapp/sessions/${sessionId}`)
      toast.success('Session deleted')
      loadSessions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete session')
    }
  }

  const reconnectSession = async (sessionId: number) => {
    setCurrentSessionId(sessionId)
    setShowQRModal(true)
    setConnectionStatus('Reconnecting...')
    setQrCode('')

    const socket = connectSocket(user!.id)

    socket.on('qr', (data: { qr: string; sessionId: number }) => {
      if (data.sessionId === sessionId) {
        setQrCode(data.qr)
        setConnectionStatus('Scan QR Code with WhatsApp')
      }
    })

    socket.on('status', (data: { status: string; sessionId: number }) => {
      if (data.sessionId === sessionId) {
        if (data.status === 'ready') {
          setConnectionStatus('Connected!')
          toast.success('WhatsApp reconnected successfully!')
          setTimeout(() => {
            setShowQRModal(false)
            loadSessions()
          }, 2000)
        }
      }
    })

    socket.emit('initSession', { sessionId, userId: user!.id })
  }

  const closeModal = () => {
    setShowQRModal(false)
    setQrCode('')
    setCurrentSessionId(null)
    setConnectionStatus('')
    disconnectSocket()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Register WAPP</h1>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Register WA</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Identification Name:
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="MI Note 8"
              className="w-full px-4 py-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>
          <button
            onClick={createSession}
            disabled={loading}
            className="btn-primary px-6 py-2.5 whitespace-nowrap"
          >
            {loading ? 'Creating...' : 'Register & Scan'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Registered Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-gray-500">No sessions registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Name</th>
                  <th className="text-left py-2 px-4">Phone Number</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b">
                    <td className="py-2 px-4">{session.sessionName}</td>
                    <td className="py-2 px-4">{session.phoneNumber || '-'}</td>
                    <td className="py-2 px-4">
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
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex gap-2">
                        {session.status !== 'connected' && (
                          <button
                            onClick={() => reconnectSession(session.id)}
                            className="text-blue-500 hover:underline text-sm"
                          >
                            Reconnect
                          </button>
                        )}
                        <button
                          onClick={() => deleteSession(session.id)}
                          className="text-red-500 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Scan QR Code</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <FaTimes className="text-xl" />
              </button>
            </div>

            <div className="text-center">
              {qrCode ? (
                <div className="mb-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`}
                    alt="QR Code"
                    className="mx-auto"
                  />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                </div>
              )}

              <p className="text-gray-600 mb-4">{connectionStatus}</p>

              <div className="flex items-center justify-center gap-2 text-gray-500">
                <FaWhatsapp className="text-green-500" />
                <span className="text-sm">Open WhatsApp on your phone and scan this QR code</span>
              </div>
            </div>

            <button onClick={closeModal} className="mt-6 w-full btn-primary">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
