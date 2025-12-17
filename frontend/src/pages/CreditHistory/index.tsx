import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

interface MessageLog {
  id: number
  recipient: string
  status: string
  source: string
  createdAt: string
}

export default function CreditHistory() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const response = await api.get('/whatsapp/messages?limit=100')
      setMessages(response.data)
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setLoading(false)
    }
  }

  const sentMessages = messages.filter((m) => m.status === 'sent')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Credit History</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <h3 className="text-gray-500 text-sm">Current Credits</h3>
          <p className="text-3xl font-bold text-green-600">{user?.credits || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-gray-500 text-sm">Messages Sent</h3>
          <p className="text-3xl font-bold text-blue-600">{sentMessages.length}</p>
        </div>
        <div className="card">
          <h3 className="text-gray-500 text-sm">Total Usage</h3>
          <p className="text-3xl font-bold text-purple-600">{messages.length}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>

        {messages.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No activity yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Recipient</th>
                  <th className="text-left py-2 px-4">Type</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Credits</th>
                </tr>
              </thead>
              <tbody>
                {messages.slice(0, 50).map((msg) => (
                  <tr key={msg.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 text-sm">
                      {new Date(msg.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4">{msg.recipient}</td>
                    <td className="py-2 px-4">
                      <span className="badge badge-info">{msg.source}</span>
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`badge ${
                          msg.status === 'sent'
                            ? 'badge-success'
                            : msg.status === 'pending'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {msg.status}
                      </span>
                    </td>
                    <td className="py-2 px-4">
                      {msg.status === 'sent' ? (
                        <span className="text-red-500">-1</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
