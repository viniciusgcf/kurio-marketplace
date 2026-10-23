import axios, { AxiosError, type AxiosInstance } from 'axios'
import { ApiErrorBodySchema, type ErrorCode } from '@/contracts'
import { cartTokenStore, tokenStore } from '@/lib/session-store'

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT' | 'UNKNOWN'

/** Erro normalizado: a UI nunca depende de AxiosError. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ClientErrorCode,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
  /** Falhas transitórias podem ser repetidas; erros 4xx de negócio não. */
  get retryable(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.status >= 500
  }
}
export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

type SessionLostHandler = (reason: 'expired' | 'unauthenticated') => void
let onSessionLost: SessionLostHandler | null = null
export const setSessionLostHandler = (h: SessionLostHandler | null) => { onSessionLost = h }

export const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  config.headers.set('X-Cart-Token', cartTokenStore.get())
  return config
})

http.interceptors.response.use(
  (r) => r,
  (error: unknown) => {
    if (axios.isCancel(error)) throw error
    const err = error as AxiosError
    if (!err.response) {
      throw new ApiError(0, err.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK', err.code === 'ECONNABORTED' ? 'A requisição demorou demais.' : 'Sem conexão com o servidor.')
    }
    const parsed = ApiErrorBodySchema.safeParse(err.response.data)
    const status = err.response.status
    if (!parsed.success) throw new ApiError(status, status >= 500 ? 'TRANSIENT' : 'UNKNOWN', 'Algo deu errado. Tente novamente.')
    const { code, message, fieldErrors, details } = parsed.data
    // Sessão perdida com token presente: limpa o contexto privado e deixa o app retomar depois do login.
    if (tokenStore.get() && (code === 'SESSION_EXPIRED' || code === 'UNAUTHENTICATED')) onSessionLost?.(code === 'SESSION_EXPIRED' ? 'expired' : 'unauthenticated')
    throw new ApiError(status, code, message, fieldErrors, details)
  },
)
