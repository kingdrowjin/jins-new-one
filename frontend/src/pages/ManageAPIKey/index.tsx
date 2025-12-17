import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { FaKey, FaTrash, FaCopy } from 'react-icons/fa'

interface ApiKey {
  id: number
  name: string
  key: string
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
}

export default function ManageAPIKey() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  useEffect(() => {
    loadApiKeys()
  }, [])

  const loadApiKeys = async () => {
    try {
      const response = await api.get('/api-keys')
      setApiKeys(response.data)
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setLoading(false)
    }
  }

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key')
      return
    }

    try {
      const response = await api.post('/api-keys', { name: newKeyName })
      setNewlyCreatedKey(response.data.key)
      setNewKeyName('')
      loadApiKeys()
      toast.success('API key created successfully')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create API key')
    }
  }

  const deleteApiKey = async (id: number) => {
    if (!confirm('Are you sure you want to delete this API key?')) return

    try {
      await api.delete(`/api-keys/${id}`)
      toast.success('API key deleted')
      loadApiKeys()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete API key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
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
      <h1 className="text-2xl font-bold mb-6">Manage API Key</h1>

      {/* Create New API Key */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Create New API Key</h2>
        <div className="flex gap-4 items-center">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Enter API key name"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
          />
          <button onClick={createApiKey} className="btn-primary whitespace-nowrap">
            Generate Key
          </button>
        </div>

        {newlyCreatedKey && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-sm text-green-800 mb-2">
              Your new API key (save it now, it won't be shown again):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white p-2 rounded text-sm break-all">
                {newlyCreatedKey}
              </code>
              <button
                onClick={() => copyToClipboard(newlyCreatedKey)}
                className="p-2 text-green-600 hover:text-green-800"
              >
                <FaCopy />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing API Keys */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Your API Keys</h2>
        {apiKeys.length === 0 ? (
          <p className="text-gray-500">No API keys created yet.</p>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 border rounded"
              >
                <div className="flex items-center gap-3">
                  <FaKey className="text-primary-500" />
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-sm text-gray-500">Key: {key.key}</p>
                    <p className="text-xs text-gray-400">
                      Created: {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteApiKey(key.id)}
                  className="text-red-500 hover:text-red-600 p-2"
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Documentation */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-6">API Documentation</h2>

        {/* SEND WAPP API */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-green-500 text-white px-3 py-1 rounded text-sm font-medium">
              POST
            </span>
            <span className="bg-orange-400 text-white px-2 py-1 rounded text-sm">
              SEND WAPP
            </span>
            <span className="bg-yellow-400 text-black px-3 py-1 rounded text-sm font-mono">
              {baseUrl}/wapp/api/send
            </span>
          </div>

          <table className="w-full border-collapse mb-4">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left p-2 border">ParameterName</th>
                <th className="text-left p-2 border">Description</th>
                <th className="text-left p-2 border">ParameterValue</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border">
                <td className="p-2 border">apikey</td>
                <td className="p-2 border">apikey generated from above.</td>
                <td className="p-2 border font-mono text-sm">67fd47ab51b34699a1822c669b5d3f99</td>
              </tr>
              <tr className="border">
                <td className="p-2 border">number</td>
                <td className="p-2 border">10 digit mobile number, use comma for multiple number</td>
                <td className="p-2 border font-mono text-sm">998899xxxx</td>
              </tr>
              <tr className="border">
                <td className="p-2 border">msg</td>
                <td className="p-2 border">Message content</td>
                <td className="p-2 border font-mono text-sm">This is Test message</td>
              </tr>
            </tbody>
          </table>

          <div className="bg-gray-100 p-3 rounded">
            <span className="text-gray-600">Example:</span>
            <code className="ml-2 text-sm break-all">
              {baseUrl}/wapp/api/send?
              <span className="bg-green-200 px-1">apikey</span>=67fd47ab51b34699a1822c669b5d3f99
              <span className="bg-yellow-200 px-1">&mobile</span>=989898XXXX
              <span className="bg-yellow-200 px-1">&msg</span>=testmsg
            </code>
          </div>
        </div>

        {/* SEND SMS API */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-green-500 text-white px-3 py-1 rounded text-sm font-medium">
              POST
            </span>
            <span className="bg-orange-400 text-white px-2 py-1 rounded text-sm">
              SEND SMS
            </span>
            <span className="bg-yellow-400 text-black px-3 py-1 rounded text-sm font-mono">
              {baseUrl}/api/sendsms
            </span>
          </div>

          <table className="w-full border-collapse mb-4">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left p-2 border">ParameterName</th>
                <th className="text-left p-2 border">Description</th>
                <th className="text-left p-2 border">ParameterValue</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border">
                <td className="p-2 border">apikey</td>
                <td className="p-2 border">apikey generated from above.</td>
                <td className="p-2 border font-mono text-sm">67fd47ab51b34699a1822c669b5d3f99</td>
              </tr>
              <tr className="border">
                <td className="p-2 border">number</td>
                <td className="p-2 border">10 digit mobile number, use comma for multiple number</td>
                <td className="p-2 border font-mono text-sm">998899xxxx</td>
              </tr>
              <tr className="border">
                <td className="p-2 border">sendername</td>
                <td className="p-2 border">6 Alphabet SenderName</td>
                <td className="p-2 border font-mono text-sm">ABCDEF</td>
              </tr>
              <tr className="border">
                <td className="p-2 border">msg</td>
                <td className="p-2 border">Message content</td>
                <td className="p-2 border font-mono text-sm">This is Test message</td>
              </tr>
            </tbody>
          </table>

          <div className="bg-gray-100 p-3 rounded">
            <span className="text-gray-600">Example:</span>
            <code className="ml-2 text-sm break-all">
              {baseUrl}/api/sendsms?
              <span className="bg-green-200 px-1">apikey</span>=67fd47ab51b34699a1822c669b5d3f99
              <span className="bg-yellow-200 px-1">&number</span>=989898XXXX
              <span className="bg-pink-200 px-1">&sendername</span>=ABCDEF
              <span className="bg-yellow-200 px-1">&msg</span>=testmsg
            </code>
          </div>
        </div>

        {/* SEND BULK SMS API */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-green-500 text-white px-3 py-1 rounded text-sm font-medium">
              POST
            </span>
            <span className="bg-orange-400 text-white px-2 py-1 rounded text-sm">
              SEND JSON BULKSMS
            </span>
            <span className="bg-yellow-400 text-black px-3 py-1 rounded text-sm font-mono">
              {baseUrl}/api/sendbulksms
            </span>
          </div>

          <p className="text-gray-600 mb-4">
            Send bulk SMS using JSON body. Pass <code>apikey</code> as query parameter and JSON body with:
          </p>

          <pre className="bg-gray-800 text-green-400 p-4 rounded overflow-x-auto">
{`{
  "numbers": ["9876543210", "9876543211", "9876543212"],
  "msg": "Your message here",
  "sendername": "ABCDEF"
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}
