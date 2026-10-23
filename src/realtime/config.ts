export const SOCKET_PATH = '/socket.io'
/** Origem do servidor de tempo real. Com mocks ativos é a própria origem da página, interceptada pelo MSW. */
export const socketOrigin = (): string => (typeof location !== 'undefined' ? location.origin : 'http://localhost:4173')
