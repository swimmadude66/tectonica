export const PRIMITIVE_TYPES = ['string', 'boolean', 'number']

export function generateRandomId() {
  const randomNum = Math.pow(10, 12) * Math.random()
  const timedNum = performance.now()
  return btoa(`${Math.floor(randomNum + timedNum)}`)
}

export function generateMagicToken({ prefix, suffix }: { prefix?: string; suffix?: string } = {}) {
  return `${prefix ?? ''}_${generateRandomId()}_${suffix ?? ''}`
}
