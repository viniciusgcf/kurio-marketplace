import { z } from 'zod'
import { SortSchema, TabSchema, type NftListParams } from '@/contracts'

/**
 * Estado do catálogo na URL: busca, filtros, ordenação e paginação sobrevivem a refresh e ao histórico.
 * `.catch(undefined)` faz um valor inválido digitado na URL ser ignorado em vez de quebrar a página.
 */
const price = z.string().regex(/^\d+(\.\d{1,18})?$/).optional().catch(undefined)
export const catalogSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: z.string().max(200).optional().catch(undefined),
  network: z.string().max(100).optional().catch(undefined),
  min: price,
  max: price,
  tab: TabSchema.optional().catch(undefined),
  sort: SortSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(999).optional().catch(undefined),
})
export type CatalogSearch = z.infer<typeof catalogSearchSchema>

export const toListParams = (s: CatalogSearch): NftListParams => ({
  q: s.q || undefined,
  category: s.category,
  network: s.network,
  minPrice: s.min,
  maxPrice: s.max,
  tab: s.tab && s.tab !== 'all' ? s.tab : undefined,
  sort: s.sort && s.sort !== 'recent' ? s.sort : undefined,
  page: s.page && s.page > 1 ? s.page : undefined,
})

export const splitCsv = (v?: string) => (v ? v.split(',').filter(Boolean) : [])
export const toggleCsv = (v: string | undefined, id: string) => {
  const set = new Set(splitCsv(v))
  if (set.has(id)) set.delete(id); else set.add(id)
  return set.size ? [...set].join(',') : undefined
}
