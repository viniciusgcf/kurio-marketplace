import Decimal from 'decimal.js'

/**
 * Valores em ETH trafegam como strings decimais (até 18 casas) e NUNCA como number.
 * Toda a aritmética passa por Decimal para não perder precisão (0.1 + 0.2 === 0.3).
 */
const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 })
export type Eth = string

export const eth = (value: Eth | number): Decimal => new D(value)

/** Canoniza: no mínimo 2 casas, sem zeros à direita além disso, no máximo 18 casas. */
export function toEth(value: Decimal | Eth): Eth {
  const fixed = new D(value).toDecimalPlaces(18, Decimal.ROUND_HALF_UP).toFixed(18)
  const [int = '0', frac = ''] = fixed.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0')
  return `${int}.${trimmed}`
}

export const addEth = (...values: Eth[]): Eth => toEth(values.reduce((acc, v) => acc.plus(v), new D(0)))
export const subEth = (a: Eth, b: Eth): Eth => toEth(new D(a).minus(b))
export const mulEth = (price: Eth, quantity: number): Eth => {
  if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError('Quantidade deve ser inteira e não negativa')
  return toEth(new D(price).times(quantity))
}
export const percentOf = (value: Eth, percent: number): Eth => toEth(new D(value).times(percent).div(100))
export const cmpEth = (a: Eth, b: Eth): number => new D(a).comparedTo(b)
export const isZeroEth = (a: Eth): boolean => new D(a).isZero()
export const minEth = (a: Eth, b: Eth): Eth => (cmpEth(a, b) <= 0 ? a : b)

/** "1.19 ETH". Mantém o separador decimal do Figma (ponto) e a precisão necessária. */
export const formatEth = (value: Eth, withUnit = true): string => `${toEth(value)}${withUnit ? ' ETH' : ''}`

/** "0,02" — usado apenas na faixa de preço, que no Figma usa vírgula. */
export const formatEthComma = (value: Eth): string => toEth(value).replace('.', ',')

export const isEthString = (v: string): boolean => /^\d+(\.\d{1,18})?$/.test(v)
