import { NextRequest, NextResponse } from 'next/server'
import net from 'net'

export const runtime = 'nodejs'

// ESC/POS kick drawer — pin 2 (most common) + pin 5 fallback
const KICK_PIN2 = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])
const KICK_PIN5 = Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa])

function sendToNetworkPrinter(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()

    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timeout connecting to ${host}:${port}`))
    }, 4000)

    socket.connect(port, host, () => {
      socket.write(Buffer.concat([data, KICK_PIN5]), (err) => {
        clearTimeout(timeout)
        socket.end()
        if (err) reject(err)
        else resolve()
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

// GET — ตรวจสอบว่า PRINTER_HOST ถูก configure หรือไม่
export async function GET() {
  const host = process.env.PRINTER_HOST
  const port = process.env.PRINTER_PORT ?? '9100'
  return NextResponse.json({
    configured: !!host,
    host: host ?? null,
    port: Number(port),
  })
}

// POST — ส่งคำสั่ง kick drawer ไปยัง network printer
export async function POST(req: NextRequest) {
  const host = process.env.PRINTER_HOST
  const port = Number(process.env.PRINTER_PORT ?? 9100)

  console.log('[Drawer] Kick command received at', new Date().toISOString())

  if (!host) {
    // ยังไม่ได้ตั้งค่า — แจ้ง client ให้รู้
    return NextResponse.json(
      { ok: false, error: 'PRINTER_HOST not configured', testMode: true },
      { status: 503 }
    )
  }

  try {
    await sendToNetworkPrinter(host, port, KICK_PIN2)
    console.log(`[Drawer] Kick sent → ${host}:${port}`)
    return NextResponse.json({ ok: true, host, port })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Drawer] Failed:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
