/**
 * One-off: rasterize public/app-icon.svg into PWA + Apple touch PNGs.
 * Run: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/app-icon.svg'))

const targets = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  // Maskable: same art with generous safe-area padding baked in via extend.
  { file: 'public/icon-maskable-512.png', size: 512, pad: 0.12 },
  { file: 'public/apple-touch-icon.png', size: 180, bg: '#38bdf8' },
]

for (const t of targets) {
  let img = sharp(svg).resize(t.size, t.size, { fit: 'contain' })
  if (t.pad) {
    const inner = Math.round(t.size * (1 - t.pad * 2))
    img = sharp(svg)
      .resize(inner, inner, { fit: 'contain' })
      .extend({
        top: Math.round((t.size - inner) / 2),
        bottom: Math.round((t.size - inner) / 2),
        left: Math.round((t.size - inner) / 2),
        right: Math.round((t.size - inner) / 2),
        background: '#6366f1',
      })
  }
  if (t.bg) {
    img = img.flatten({ background: t.bg })
  }
  await img.png().toFile(resolve(root, t.file))
  console.log('wrote', t.file)
}
