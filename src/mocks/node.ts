import { setupServer } from 'msw/node'
import { createHandlers } from './handlers'
import { createSocketHandlers } from './socket'

/** Servidor MSW para Node (verificação de contratos e testes sem navegador). */
export const createMockServer = (base = 'http://mock.local/api') => setupServer(...createHandlers(base), ...createSocketHandlers())
