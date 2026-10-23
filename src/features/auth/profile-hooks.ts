import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { qk } from '@/app/queries'
import type { Session } from '@/contracts'

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.profile.update,
    onSuccess: (user) => qc.setQueryData<Session | null>(qk.session, (s) => (s ? { ...s, user } : s)),
  })
}
export const useChangePassword = () => useMutation({ mutationFn: api.profile.changePassword })

/** Redimensiona o avatar para 128×128 JPEG no cliente (o arquivo original nunca é enviado). */
export function resizeAvatar(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem (PNG, JPG ou WebP).'))
    if (file.size > 5 * 1024 * 1024) return reject(new Error('A imagem deve ter até 5 MB.'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('Não foi possível processar a imagem.')) }
      const side = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')) }
    img.src = url
  })
}
