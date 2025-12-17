import { useState, useEffect } from 'react'
import api from '../../services/api'

interface MessageLog {
  id: number
  recipient: string
  message: string
  status: string
  source: string
  createdAt: string
}

export default function WAPPReport() {
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadMessages()
  }, [])

  const loadMessages = async () => {
    try {
      const response = await api.get('/whatsapp/messages?limit=500')
      setMessages(response.data)
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredMessages = messages.filter((m) => {
    if (filter === 'all') return true
    return m.status === filter
  })

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === 'sent').length,
    pending: messages.filter((m) => m.status === 'pending').length,
    failed: messages.filter((m) => m.status === 'failed').length,
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
      <h1 className="text-2xl font-bold mb-6">WAPP Report</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-gray-500">Total</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
          <p className="text-gray-500">Sent</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-gray-500">Pending</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-gray-500">Failed</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${
              filter === 'all' ? 'bg-primary-500 text-white' : 'bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('sent')}
            className={`px-4 py-2 rounded ${
              filter === 'sent' ? 'bg-green-500 text-white' : 'bg-gray-200'
            }`}
          >
            Sent
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded ${
              filter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-gray-200'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-4 py-2 rounded ${
              filter === 'failed' ? 'bg-red-500 text-white' : 'bg-gray-200'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Messages Table */}
      <div className="card overflow-x-auto">
        {filteredMessages.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No messages found</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Recipient</th>
                <th className="text-left py-2 px-4">Message</th>
                <th className="text-left py-2 px-4">Status</th>
                <th className="text-left py-2 px-4">Source</th>
                <th className="text-left py-2 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredMessages.map((msg) => (
                <tr key={msg.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-4">{msg.recipient}</td>
                  <td className="py-2 px-4">
                    <div className="max-w-xs truncate" title={msg.message}>
                      {msg.message}
                    </div>
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
                    <span className="badge badge-info">{msg.source}</span>
                  </td>
                  <td className="py-2 px-4 text-sm text-gray-500">
                    {new Date(msg.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
