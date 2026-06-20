import { createClient } from '@supabase/supabase-js'

// ใช้ service key ฝั่ง server เพื่อ bypass RLS (ไม่ต้องใช้ frontend client ตอนนี้)
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!url || !key) {
  console.warn('[Supabase] SUPABASE_URL or key not set — DB calls will fail')
}

export const supabase = createClient(url, key)
