import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'X-Watershed-Client': '1' },
})

api.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data
    const message = data && typeof data === 'object' && 'message' in data ? data.message : undefined
    if (typeof message === 'string') return Promise.reject(new Error(message))
    if (Array.isArray(message) && message.every(item => typeof item === 'string')) {
      return Promise.reject(new Error(message.join(', ')))
    }
    return Promise.reject(new Error(error.response ? `Request failed (${error.response.status})` : error.message))
  }
  return Promise.reject(error)
})

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default api
