export const PRIMITIVE_TYPES = ['string', 'boolean', 'number']

export function generateRandomId() {
  const randomNum = Math.pow(10, 12) * Math.random()
  const timedNum = performance.now()
  const seed = Math.floor(randomNum + timedNum).toString(16)
  return `0x${seed}`
}

export function generateMagicToken({ prefix, suffix }: { prefix?: string; suffix?: string } = {}) {
  return `${prefix ?? ''}_${generateRandomId()}_${suffix ?? ''}`
}
