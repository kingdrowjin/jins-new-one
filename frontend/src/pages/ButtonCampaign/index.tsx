import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import api from '../../services/api'
import toast from 'react-hot-toast'

interface Session {
  id: number
  sessionName: string
  status: string
}

export default function ButtonCampaign() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<number | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [numbers, setNumbers] = useState('')
  const [message, setMessage] = useState('')
  const [linkText, setLinkText] = useState('Visit Now')
  const [linkUrl, setLinkUrl] = useState('')
  const [callText, setCallText] = useState('Call Now')
  const [callNumber, setCallNumber] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

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

  const onDropImages = useCallback((acceptedFiles: File[]) => {
    const newImages = [...images, ...acceptedFiles].slice(0, 4)
    setImages(newImages)
  }, [images])

  const onDropVideo = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setVideo(acceptedFiles[0])
    }
  }, [])

  const onDropPdf = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setPdf(acceptedFiles[0])
    }
  }, [])

  const { getRootProps: getImageRootProps, getInputProps: getImageInputProps } = useDropzone({
    onDrop: onDropImages,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] },
    maxSize: 1024 * 1024,
  })

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps } = useDropzone({
    onDrop: onDropVideo,
    accept: { 'video/*': ['.mp4', '.avi', '.mov'] },
    maxSize: 3 * 1024 * 1024,
  })

  const { getRootProps: getPdfRootProps, getInputProps: getPdfInputProps } = useDropzone({
    onDrop: onDropPdf,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 1024 * 1024,
  })

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedSession) {
      toast.error('Please select a WhatsApp session')
      return
    }

    if (!campaignName.trim()) {
      toast.error('Please enter a campaign name')
      return
    }

    if (!numbers.trim()) {
      toast.error('Please enter at least one phone number')
      return
    }

    if (!message.trim()) {
      toast.error('Please enter a message')
      return
    }

    setLoading(true)

    try {
      // Create campaign
      const campaignResponse = await api.post('/campaigns', {
        name: campaignName,
        message,
        sessionId: selectedSession,
        linkText: linkUrl ? linkText : undefined,
        linkUrl: linkUrl || undefined,
        callText: callNumber ? callText : undefined,
        callNumber: callNumber || undefined,
      })

      const campaignId = campaignResponse.data.id

      // Add recipients
      const phoneNumbers = numbers
        .split('\n')
        .map((n) => n.trim())
        .filter((n) => n)

      await api.post(`/campaigns/${campaignId}/recipients`, { phoneNumbers })

      // Upload media
      if (images.length > 0 || video || pdf) {
        const formData = new FormData()
        images.forEach((img) => formData.append('files', img))
        if (video) formData.append('files', video)
        if (pdf) formData.append('files', pdf)

        await api.post(`/campaigns/${campaignId}/media`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      // Start campaign
      await api.post(`/campaigns/${campaignId}/send`)

      toast.success('Campaign started successfully!')

      // Reset form
      setCampaignName('')
      setNumbers('')
      setMessage('')
      setLinkUrl('')
      setCallNumber('')
      setImages([])
      setVideo(null)
      setPdf(null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create campaign')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Button Campaign</h1>

      <form onSubmit={handleSubmit}>
        <div className="card mb-4">
          <div className="flex gap-4 items-center">
            <label className="bg-red-400 text-white px-4 py-2 rounded text-sm font-medium whitespace-nowrap">
              Campaign Name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter campaign name"
            />
            {sessions.length > 0 && (
              <select
                value={selectedSession || ''}
                onChange={(e) => setSelectedSession(Number(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.sessionName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Numbers */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numbers:
            </label>
            <textarea
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-64 resize-none"
              placeholder="Enter phone numbers (one per line)"
            />
          </div>

          {/* Message and Buttons */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message:
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32 resize-none mb-4"
              placeholder="Enter your message"
            />

            {/* Link Button */}
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-blue-500 text-white px-4 py-2 rounded text-sm whitespace-nowrap">Link</span>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36"
                placeholder="Visit Now"
              />
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="http://"
              />
            </div>

            {/* Call Button */}
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-red-400 text-white px-4 py-2 rounded text-sm whitespace-nowrap">Number</span>
              <input
                type="text"
                value={callText}
                onChange={(e) => setCallText(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36"
                placeholder="Call Now"
              />
              <input
                type="text"
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10 Digit number"
              />
            </div>

            {/* Image Upload */}
            <div className="mb-4">
              <div className="bg-blue-400 text-white px-3 py-2 rounded-t text-sm">
                Image Upload (Max file size 1 MB.)
              </div>
              <div
                {...getImageRootProps()}
                className="border-2 border-dashed border-gray-300 p-4 text-center cursor-pointer hover:border-blue-500 transition"
              >
                <input {...getImageInputProps()} />
                <p className="text-gray-500">
                  Drag & Drop image files(maximum 4)or{' '}
                  <span className="text-blue-500 underline">Browse Image</span>
                </p>
                {images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap justify-center">
                    {images.map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={URL.createObjectURL(img)}
                          alt=""
                          className="w-16 h-16 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeImage(index)
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Video and PDF Upload */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="bg-green-500 text-white px-3 py-2 rounded-t text-sm">
                  Video Upload (Max file size 1 MB.)
                </div>
                <div
                  {...getVideoRootProps()}
                  className="border-2 border-dashed border-gray-300 p-4 text-center cursor-pointer hover:border-green-500 transition"
                >
                  <input {...getVideoInputProps()} />
                  <p className="text-gray-500 text-sm">
                    Drag & Drop Video files(max size:3 MB) or{' '}
                    <span className="text-blue-500 underline">Browse Video</span>
                  </p>
                  {video && (
                    <p className="text-green-600 mt-2 text-sm">{video.name}</p>
                  )}
                </div>
              </div>

              <div>
                <div className="bg-red-400 text-white px-3 py-2 rounded-t text-sm">
                  PDF (Max file size 1 MB.)
                </div>
                <div
                  {...getPdfRootProps()}
                  className="border-2 border-dashed border-gray-300 p-4 text-center cursor-pointer hover:border-red-500 transition"
                >
                  <input {...getPdfInputProps()} />
                  <p className="text-gray-500 text-sm">
                    Drag & Drop PDF file(max size:1 MB) or{' '}
                    <span className="text-blue-500 underline">Browse PDF</span>
                  </p>
                  {pdf && (
                    <p className="text-red-600 mt-2 text-sm">{pdf.name}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Now'}
          </button>
        </div>
      </form>
    </div>
  )
}
