import api from './Api'

export async function getSession() {
  return (await api.get<{ username: string | null }>('/auth/me')).data
}

export async function authenticate(action: 'login' | 'register', username: string, password: string) {
  return (await api.post<{ username: string }>(`/auth/${action}`, { username, password })).data
}

export async function logout() {
  return (await api.post<{ success: boolean }>('/auth/logout')).data
}
