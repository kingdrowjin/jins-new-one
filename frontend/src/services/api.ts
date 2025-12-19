import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only clear token and redirect for 401 on protected routes, not on login/register
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      // Don't logout if the 401 is from login/register attempts
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        // Check if we actually have a token (meaning we're logged in)
        const token = localStorage.getItem('token')
        if (token) {
          localStorage.removeItem('token')
          // Use soft redirect - let React handle it
          window.location.replace('/login')
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
