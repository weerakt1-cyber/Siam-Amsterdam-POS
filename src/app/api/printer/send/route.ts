import { NextResponse } from 'next/server'
import net from 'node:net'

// POST /api/printer/send
// Body: { ip: string, port?: number, bytes: number[] }
// Opens TCP socket server-side → writes ESC/POS bytes → printer (port 9100)
// Works from both browser and Android APK (capacitor server mode)

export async function POST(req: Request) {
  try {
    const body = await req.json() as { ip?: string; port?: number; bytes?: number[] }
    const { ip, port = 9100, bytes = [] } = body

    if (!ip || typeof ip !== 'string') {
      return NextResponse.json({ ok: false, error: 'ip required' }, { status: 400 })
    }

    await sendTcp(ip, port, Buffer.from(bytes))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

function sendTcp(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let done = false

    const finish = (err?: Error) => {
      if (done) return
      done = true
      socket.destroy()
      if (err) reject(err)
      else resolve()
    }

    socket.setTimeout(6000)
    socket.on('timeout', () => finish(new Error(`Timeout — cannot reach ${ip}:${port}`)))
    socket.on('error',   (e) => finish(e))

    socket.connect(port, ip, () => {
      if (data.length === 0) { finish(); return }
      socket.write(data, (err) => finish(err ?? undefined))
    })
  })
}
