// One-off script: regenerate every sized brand asset from the three master
// files in brand-assets/. Not part of the build — run manually whenever the
// source logos change: `node scripts/generate-brand-assets.js`
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ICON_SRC = path.join(ROOT, 'brand-assets/app-icon-source.png')
const LOGO_SRC = path.join(ROOT, 'brand-assets/logo-source.png')

const ANDROID_DENSITIES = {
  mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
}

async function squareIcon(size) {
  return sharp(ICON_SRC).resize(size, size).png().toBuffer()
}

async function squareLogo(size) {
  // Source is nearly-square (1286x1226) — center-crop to square first so
  // resize doesn't distort the mark/text, then resize down.
  const meta = await sharp(LOGO_SRC).metadata()
  const side = Math.min(meta.width, meta.height)
  const left = Math.round((meta.width - side) / 2)
  const top = Math.round((meta.height - side) / 2)
  return sharp(LOGO_SRC)
    .extract({ left, top, width: side, height: side })
    .resize(size, size)
    .toBuffer()
}

// Minimal "PNG-in-ICO" container — a single-image ICO wrapping a PNG payload.
// Supported by all modern browsers and Windows since Vista.
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)  // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)  // height (0 = 256)
  entry.writeUInt8(0, 2)                       // color palette
  entry.writeUInt8(0, 3)                       // reserved
  entry.writeUInt16LE(1, 4)                    // color planes
  entry.writeUInt16LE(32, 6)                   // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8)     // image data size
  entry.writeUInt32LE(header.length + entry.length, 12) // offset

  return Buffer.concat([header, entry, pngBuffer])
}

async function main() {
  // ── PWA / web icons ─────────────────────────────────────────────────────
  await fs.promises.writeFile(path.join(ROOT, 'public/icons/icon-192.png'), await squareIcon(192))
  await fs.promises.writeFile(path.join(ROOT, 'public/icons/icon-512.png'), await squareIcon(512))
  await fs.promises.writeFile(path.join(ROOT, 'public/icons/apple-touch-icon.png'), await squareIcon(180))

  // Next's dev image pipeline requires the embedded PNG to be RGBA —
  // ensureAlpha() guarantees a 4-channel PNG even if the source has none.
  const favPng = await sharp(ICON_SRC).resize(48, 48).ensureAlpha().png().toBuffer()
  await fs.promises.writeFile(path.join(ROOT, 'src/app/favicon.ico'), buildIco(favPng, 48))

  // ── In-app logo (login screen, sidebar) ─────────────────────────────────
  const logo200 = await squareLogo(200)
  await fs.promises.writeFile(path.join(ROOT, 'public/logo.png'), logo200)
  await sharp(logo200).jpeg({ quality: 92 }).toFile(path.join(ROOT, 'public/logo.jpg'))

  // ── Wide header/website lockup — kept for future use, no code slot yet ──
  await sharp(path.join(ROOT, 'brand-assets/logo-wide-source.jpg'))
    .png()
    .toFile(path.join(ROOT, 'public/logo-wide.png'))

  // ── Android launcher icons ───────────────────────────────────────────────
  for (const [density, size] of Object.entries(ANDROID_DENSITIES)) {
    const buf = await squareIcon(size)
    const dir = path.join(ROOT, `android/app/src/main/res/mipmap-${density}`)
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      await fs.promises.writeFile(path.join(dir, name), buf)
    }
  }

  console.log('Brand assets regenerated.')
}

main().catch(err => { console.error(err); process.exit(1) })
