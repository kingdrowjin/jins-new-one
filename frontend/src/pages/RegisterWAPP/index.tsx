import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { connectSocket, disconnectSocket } from '../../services/socket'
import toast from 'react-hot-toast'
import { FaWhatsapp, FaTimes, FaQrcode, FaMobileAlt } from 'react-icons/fa'

interface Session {
  id: number
  sessionName: string
  status: string
  phoneNumber: string | null
  createdAt: string
}

type AuthMethod = 'qr' | 'phone'

export default function RegisterWAPP() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionName, setSessionName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [pairingCode, setPairingCode] = useState('')
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

    if (authMethod === 'phone' && !phoneNumber.trim()) {
      toast.error('Please enter your WhatsApp phone number')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/whatsapp/sessions', {
        sessionName: sessionName.trim(),
      })

      const session = response.data.session
      setCurrentSessionId(session.id)
      setShowModal(true)
      setConnectionStatus('Initializing...')
      setQrCode('')
      setPairingCode('')

      const socket = connectSocket(user!.id)

      socket.on('qr', (data: { qr: string; sessionId: number }) => {
        if (data.sessionId === session.id) {
          setQrCode(data.qr)
          setConnectionStatus('Scan QR Code with WhatsApp')
        }
      })

      socket.on('pairingCode', (data: { code: string; sessionId: number }) => {
        if (data.sessionId === session.id) {
          setPairingCode(data.code)
          setConnectionStatus('Enter this code in WhatsApp')
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
              setShowModal(false)
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

      // Use different event based on auth method
      if (authMethod === 'phone') {
        socket.emit('initSessionWithPhone', {
          sessionId: session.id,
          userId: user!.id,
          phoneNumber: phoneNumber.replace(/[^0-9]/g, '')
        })
      } else {
        socket.emit('initSession', { sessionId: session.id, userId: user!.id })
      }

      setSessionName('')
      setPhoneNumber('')
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

  const reconnectSession = async (sessionId: number, method: AuthMethod = 'phone') => {
    if (method === 'phone' && !phoneNumber.trim()) {
      toast.error('Please enter your WhatsApp phone number to reconnect')
      return
    }

    setCurrentSessionId(sessionId)
    setShowModal(true)
    setConnectionStatus('Reconnecting...')
    setQrCode('')
    setPairingCode('')

    const socket = connectSocket(user!.id)

    socket.on('qr', (data: { qr: string; sessionId: number }) => {
      if (data.sessionId === sessionId) {
        setQrCode(data.qr)
        setConnectionStatus('Scan QR Code with WhatsApp')
      }
    })

    socket.on('pairingCode', (data: { code: string; sessionId: number }) => {
      if (data.sessionId === sessionId) {
        setPairingCode(data.code)
        setConnectionStatus('Enter this code in WhatsApp')
      }
    })

    socket.on('status', (data: { status: string; sessionId: number }) => {
      if (data.sessionId === sessionId) {
        if (data.status === 'ready') {
          setConnectionStatus('Connected!')
          toast.success('WhatsApp reconnected successfully!')
          setTimeout(() => {
            setShowModal(false)
            loadSessions()
          }, 2000)
        }
      }
    })

    if (method === 'phone') {
      socket.emit('initSessionWithPhone', {
        sessionId,
        userId: user!.id,
        phoneNumber: phoneNumber.replace(/[^0-9]/g, '')
      })
    } else {
      socket.emit('initSession', { sessionId, userId: user!.id })
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setQrCode('')
    setPairingCode('')
    setCurrentSessionId(null)
    setConnectionStatus('')
    disconnectSocket()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Register WAPP</h1>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Register WA</h2>

        {/* Auth Method Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setAuthMethod('phone')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              authMethod === 'phone'
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <FaMobileAlt />
            Phone Code (Faster)
          </button>
          <button
            onClick={() => setAuthMethod('qr')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              authMethod === 'qr'
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <FaQrcode />
            QR Code
          </button>
        </div>

        <div className="flex flex-col gap-4">
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
            {authMethod === 'phone' && (
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WhatsApp Number (with country code):
                </label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="919876543210"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                />
              </div>
            )}
          </div>
          <button
            onClick={createSession}
            disabled={loading}
            className="btn-primary px-6 py-2.5 whitespace-nowrap self-start"
          >
            {loading ? 'Creating...' : authMethod === 'phone' ? 'Register with Phone' : 'Register & Scan'}
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
                            onClick={() => reconnectSession(session.id, authMethod)}
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

      {/* Connection Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {pairingCode ? 'Enter Pairing Code' : 'Scan QR Code'}
              </h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <FaTimes className="text-xl" />
              </button>
            </div>

            <div className="text-center">
              {pairingCode ? (
                <div className="mb-4">
                  <div className="text-4xl font-mono font-bold tracking-widest bg-gray-100 py-6 px-4 rounded-lg text-green-600">
                    {pairingCode}
                  </div>
                  <p className="mt-4 text-sm text-gray-600">
                    1. Open WhatsApp on your phone<br/>
                    2. Go to Settings → Linked Devices<br/>
                    3. Tap "Link a Device"<br/>
                    4. Tap "Link with phone number instead"<br/>
                    5. Enter the code above
                  </p>
                </div>
              ) : qrCode ? (
                <div className="mb-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`}
                    alt="QR Code"
                    className="mx-auto"
                  />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center flex-col gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                  <p className="text-sm text-gray-500">This may take 20-40 seconds on free hosting...</p>
                </div>
              )}

              <p className="text-gray-600 mb-4 font-medium">{connectionStatus}</p>

              <div className="flex items-center justify-center gap-2 text-gray-500">
                <FaWhatsapp className="text-green-500" />
                <span className="text-sm">
                  {pairingCode
                    ? 'Enter this code in WhatsApp to link your device'
                    : 'Open WhatsApp on your phone and scan this QR code'}
                </span>
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
