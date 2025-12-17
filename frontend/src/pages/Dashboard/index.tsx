import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import { FaWhatsapp, FaPaperPlane, FaCheckCircle, FaTimesCircle } from 'react-icons/fa'

interface Stats {
  totalSessions: number
  activeSessions: number
  totalMessages: number
  sentMessages: number
  failedMessages: number
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({
    totalSessions: 0,
    activeSessions: 0,
    totalMessages: 0,
    sentMessages: 0,
    failedMessages: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const [sessionsRes, messagesRes] = await Promise.all([
        api.get('/whatsapp/sessions'),
        api.get('/whatsapp/messages?limit=1000'),
      ])

      const sessions = sessionsRes.data
      const messages = messagesRes.data

      setStats({
        totalSessions: sessions.length,
        activeSessions: sessions.filter((s: any) => s.status === 'connected').length,
        totalMessages: messages.length,
        sentMessages: messages.filter((m: any) => m.status === 'sent').length,
        failedMessages: messages.filter((m: any) => m.status === 'failed').length,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className={`p-4 rounded-full ${color}`}>
          <Icon className="text-2xl text-white" />
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold">Welcome, {user?.name}!</h2>
        <p className="text-gray-600">Credits available: {user?.credits}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={FaWhatsapp}
          label="Active Sessions"
          value={stats.activeSessions}
          color="bg-green-500"
        />
        <StatCard
          icon={FaPaperPlane}
          label="Total Messages"
          value={stats.totalMessages}
          color="bg-blue-500"
        />
        <StatCard
          icon={FaCheckCircle}
          label="Sent Messages"
          value={stats.sentMessages}
          color="bg-primary-500"
        />
        <StatCard
          icon={FaTimesCircle}
          label="Failed Messages"
          value={stats.failedMessages}
          color="bg-red-500"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <a
              href="/register-wapp"
              className="block p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <FaWhatsapp className="text-2xl text-green-500" />
                <div>
                  <p className="font-medium">Register WhatsApp</p>
                  <p className="text-sm text-gray-500">Connect a new WhatsApp number</p>
                </div>
              </div>
            </a>
            <a
              href="/button-campaign"
              className="block p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <FaPaperPlane className="text-2xl text-blue-500" />
                <div>
                  <p className="font-medium">Create Campaign</p>
                  <p className="text-sm text-gray-500">Send bulk messages with media</p>
                </div>
              </div>
            </a>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">WhatsApp Sessions</h3>
          {stats.totalSessions === 0 ? (
            <p className="text-gray-500">No WhatsApp sessions registered yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-600">
                Total Sessions: <span className="font-semibold">{stats.totalSessions}</span>
              </p>
              <p className="text-green-600">
                Connected: <span className="font-semibold">{stats.activeSessions}</span>
              </p>
              <p className="text-gray-600">
                Disconnected: <span className="font-semibold">{stats.totalSessions - stats.activeSessions}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
