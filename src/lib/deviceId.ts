/** Stable per-install device id (for sync provenance). */
const DEVICE_ID_KEY = 'vision_device_id'

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'unknown-device'
  }
}
