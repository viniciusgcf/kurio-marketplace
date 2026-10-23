/**
 * Servidor Socket.IO simulado, sobre @mswjs/socket.io-binding + ws.link do MSW.
 * O app usa socket.io-client de verdade; aqui só existe o "lado servidor".
 *
 * Limitações conhecidas (documentadas em ARCHITECTURE.md):
 *  - O binding só entende eventos (fire-and-forget) na namespace "/": sem acks, rooms, broadcast ou namespaces.
 *  - Só o transporte WebSocket é interceptado (o cliente usa transports: ['websocket']; long-polling não existe).
 *  - O binding envia o handshake engine.io/socket.io, mas não os pings de keep-alive. Sem eles o
 *    socket.io-client derruba a conexão após pingInterval + pingTimeout (30 s). Enviamos "2" (ping) a cada 20 s.
 */
import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws } from 'msw'
import { SOCKET_EVENTS } from '@/contracts'
import { socketOrigin, SOCKET_PATH } from '@/realtime/config'
import { getDb } from './db'
import { hub, type HubConnection } from './hub'

export function createSocketHandlers() {
  // O MSW remove o prefixo /socket.io/ da URL do cliente antes de comparar: o handler é registrado só com a origem.
  const link = ws.link(socketOrigin().replace(/^http/, 'ws'))
  return [
    link.addEventListener('connection', (connection) => {
      // Mesma origem também serve o WebSocket de HMR do Vite no dev: tudo que não é Socket.IO segue para o servidor real.
      if (!new URL(connection.client.url).pathname.startsWith(SOCKET_PATH)) {
        connection.server.connect()
        return
      }
      if (hub.isOffline()) {
        connection.client.close(1011, 'mock: realtime offline')
        return
      }
      const io = toSocketIo(connection)
      const entry: HubConnection = {
        id: hub.nextId(),
        userId: null,
        emit: (event, payload) => io.client.emit(event, payload),
        close: (code, reason) => connection.client.close(code, reason),
      }
      hub.add(entry)

      const keepAlive = setInterval(() => connection.client.send('2'), 20_000)

      // O cliente se identifica depois de conectar; eventos privados só chegam a quem provou ter sessão.
      io.client.on(SOCKET_EVENTS.subscribe, (_e, payload: { token?: string } | undefined) => {
        const session = payload?.token ? getDb().sessions[payload.token] : undefined
        entry.userId = session && session.expiresAt > Date.now() ? session.userId : null
      })

      connection.client.addEventListener('close', () => {
        clearInterval(keepAlive)
        hub.remove(entry)
      })
    }),
  ]
}
