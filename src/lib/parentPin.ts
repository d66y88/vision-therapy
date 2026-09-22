/**
 * Simple local parent PIN gate (not cryptographic — keeps kids from clearing data).
 * Parent shell always requires unlock; first visit sets a PIN.
 */

const PIN_KEY = 'vision_parent_pin'
const UNLOCK_KEY = 'vision_parent_unlocked'

export function hasParentPin(): boolean {
  return Boolean(localStorage.getItem(PIN_KEY))
}

export function setParentPin(pin: string): void {
  const cleaned = pin.replace(/\D/g, '').slice(0, 6)
  if (cleaned.length < 4) throw new Error('PIN 至少 4 位数字')
  localStorage.setItem(PIN_KEY, cleaned)
  sessionStorage.setItem(UNLOCK_KEY, '1')
}

export function clearParentPin(): void {
  localStorage.removeItem(PIN_KEY)
  sessionStorage.removeItem(UNLOCK_KEY)
}

/** Session unlock — false until PIN setup/unlock this browser session. */
export function isParentUnlocked(): boolean {
  return sessionStorage.getItem(UNLOCK_KEY) === '1'
}

export function tryUnlockParent(pin: string): boolean {
  const stored = localStorage.getItem(PIN_KEY)
  if (!stored) return false
  const ok = pin.replace(/\D/g, '') === stored
  if (ok) sessionStorage.setItem(UNLOCK_KEY, '1')
  return ok
}

export function lockParentSession(): void {
  sessionStorage.removeItem(UNLOCK_KEY)
}
