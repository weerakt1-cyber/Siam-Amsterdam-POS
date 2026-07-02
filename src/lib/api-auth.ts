import { NextRequest } from 'next/server'
import { supabase } from './supabase'

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export type ApiKeyRecord = {
  id: string
  label: string
  active: boolean
}

/**
 * Validates the X-API-Key header against hashed keys in the api_keys table.
 * Returns the key record if valid, null if missing/invalid/inactive.
 */
export async function validateApiKey(req: NextRequest): Promise<ApiKeyRecord | null> {
  const raw = req.headers.get('x-api-key')
  if (!raw) return null

  const hash = await sha256Hex(raw)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, active')
    .eq('key_hash', hash)
    .eq('active', true)
    .single()

  if (error || !data) return null
  return data as ApiKeyRecord
}

/**
 * Generates a new API key, stores its hash in Supabase, returns the raw key.
 * The raw key is shown once — never stored.
 */
export async function generateApiKey(label: string): Promise<{ raw: string; id: string }> {
  const raw  = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const hash = await sha256Hex(raw)
  const id   = crypto.randomUUID()

  const { error } = await supabase.from('api_keys').insert({
    id,
    label,
    key_hash:   hash,
    active:     true,
    created_at: new Date().toISOString(),
  })
  if (error) throw error

  return { raw, id }
}

export async function listApiKeys(): Promise<{ id: string; label: string; active: boolean; createdAt: string }[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, active, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id:        r.id,
    label:     r.label,
    active:    r.active,
    createdAt: r.created_at,
  }))
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_keys')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}
