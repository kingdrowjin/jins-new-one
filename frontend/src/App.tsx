import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import RegisterWAPP from './pages/RegisterWAPP'
import WappCampaign from './pages/WappCampaign'
import ButtonCampaign from './pages/ButtonCampaign'
import WAPPReport from './pages/WAPPReport'
import WAppChannel from './pages/WAppChannel'
import CreditHistory from './pages/CreditHistory'
import ChangePassword from './pages/ChangePassword'
import ManageAPIKey from './pages/ManageAPIKey'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="register-wapp" element={<RegisterWAPP />} />
        <Route path="wapp-campaign" element={<WappCampaign />} />
        <Route path="button-campaign" element={<ButtonCampaign />} />
        <Route path="wapp-report" element={<WAPPReport />} />
        <Route path="wapp-channel" element={<WAppChannel />} />
        <Route path="credit-history" element={<CreditHistory />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="manage-api-key" element={<ManageAPIKey />} />
      </Route>
    </Routes>
  )
}

export default App
