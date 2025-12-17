import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  MdDashboard,
  MdCampaign,
  MdMessage,
  MdAssessment,
  MdPhoneAndroid,
  MdHistory,
  MdLock,
  MdVpnKey,
  MdLogout,
  MdMenu,
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { useState } from 'react'

const menuItems = [
  { path: '/', icon: MdDashboard, label: 'Dashboard' },
  { path: '/wapp-campaign', icon: MdMessage, label: 'Wapp Campaign' },
  { path: '/button-campaign', icon: MdCampaign, label: 'Button Campaign' },
  { path: '/wapp-report', icon: MdAssessment, label: 'WAPP Report' },
  { path: '/register-wapp', icon: FaWhatsapp, label: 'Register WAPP' },
  { path: '/wapp-channel', icon: MdPhoneAndroid, label: 'WApp Channel' },
  { path: '/credit-history', icon: MdHistory, label: 'Credit History' },
  { path: '/change-password', icon: MdLock, label: 'Change Password' },
  { path: '/manage-api-key', icon: MdVpnKey, label: 'Manage APIKey' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div
        className={`sidebar fixed left-0 top-0 h-full transition-all duration-300 z-50 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">Jantu</h1>
          <p className="text-sm text-gray-400">WhatsApp Automation</p>
        </div>

        <nav className="mt-4">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''}`
              }
              end={item.path === '/'}
            >
              <item.icon className="text-xl" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            onClick={logout}
            className="sidebar-item w-full text-left text-red-400 hover:text-red-300"
          >
            <MdLogout className="text-xl" />
            <span>Logout</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-0'
        }`}
      >
        {/* Header */}
        <header className="bg-white shadow-sm h-14 flex items-center justify-between px-4 sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600 hover:text-gray-800"
          >
            <MdMenu className="text-2xl" />
          </button>

          <div className="flex items-center gap-4">
            <span className="badge badge-success">Credit</span>
            <span className="badge badge-info">W.API:{user?.credits || 0}</span>
            <span className="text-gray-700">{user?.name}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
