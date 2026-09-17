import type {
  Application,
  ApplicationDraft,
  Resume,
  ResumeDraft,
  ResumeVersion,
  Settings,
  Stats,
  User,
} from '../types'

const BASE = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Called whenever the server says the session is gone, so the app can show the login screen. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    })
  } catch {
    throw new ApiError('Cannot reach the DevTrack API. Is the server running?', 0)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with ${response.status}`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

const body = (value: unknown) => JSON.stringify(value)

export interface ApplicationQuery {
  q?: string
  status?: string
  locationType?: string
  sort?: string
}

export const api = {
  auth: {
    config: () => request<{ googleClientId: string | null }>('/auth/config'),
    me: () => request<{ user: User | null }>('/auth/me'),
    login: (username: string, password: string) =>
      request<{ user: User }>('/auth/login', { method: 'POST', body: body({ username, password }) }),
    register: (username: string, password: string) =>
      request<{ user: User }>('/auth/register', {
        method: 'POST',
        body: body({ username, password }),
      }),
    google: (credential: string) =>
      request<{ user: User }>('/auth/google', { method: 'POST', body: body({ credential }) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },

  applications: {
    list(query: ApplicationQuery = {}) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value) params.set(key, value)
      }
      const suffix = params.toString() ? `?${params}` : ''
      return request<Application[]>(`/applications${suffix}`)
    },
    get: (id: string) => request<Application>(`/applications/${id}`),
    create: (draft: ApplicationDraft) =>
      request<Application>('/applications', { method: 'POST', body: body(draft) }),
    update: (id: string, draft: ApplicationDraft & { statusNote?: string }) =>
      request<Application>(`/applications/${id}`, { method: 'PATCH', body: body(draft) }),
    remove: (id: string) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
    resumes: (id: string) => request<Resume[]>(`/applications/${id}/resumes`),
  },

  resumes: {
    list: (query: { applicationId?: string; q?: string } = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value) params.set(key, value)
      }
      const suffix = params.toString() ? `?${params}` : ''
      return request<Resume[]>(`/resumes${suffix}`)
    },
    get: (id: string) => request<Resume>(`/resumes/${id}`),
    create: (draft: ResumeDraft) =>
      request<Resume>('/resumes', { method: 'POST', body: body(draft) }),
    update: (id: string, draft: ResumeDraft) =>
      request<Resume>(`/resumes/${id}`, { method: 'PATCH', body: body(draft) }),
    remove: (id: string) => request<void>(`/resumes/${id}`, { method: 'DELETE' }),
    duplicate: (id: string, draft: Pick<ResumeDraft, 'name' | 'company' | 'applicationId'>) =>
      request<Resume>(`/resumes/${id}/duplicate`, { method: 'POST', body: body(draft) }),
    saveVersion: (id: string, draft: { label?: string; note?: string }) =>
      request<ResumeVersion>(`/resumes/${id}/versions`, { method: 'POST', body: body(draft) }),
    restoreVersion: (id: string, versionId: string) =>
      request<Resume>(`/resumes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
    deleteVersion: (id: string, versionId: string) =>
      request<void>(`/resumes/${id}/versions/${versionId}`, { method: 'DELETE' }),

    /** Accepts a bundle, a bare array, or a single resume object. */
    import: (payload: unknown) =>
      request<Resume[]>('/resumes/import', { method: 'POST', body: body(payload) }),
  },

  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Settings>) =>
      request<Settings>('/settings', { method: 'PATCH', body: body(patch) }),
  },

  stats: () => request<Stats>('/stats'),

  exportUrl: () => `${BASE}/export/applications.csv`,
  resumeBundleUrl: () => `${BASE}/resumes/export`,
  resumeDownloadUrl: (id: string) => `${BASE}/resumes/${id}/download`,
}
