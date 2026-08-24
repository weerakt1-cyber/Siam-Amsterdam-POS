// PromptPay QR string generator (EMVCo QR / BOT specification)
// Works in both browser and Node.js — no dependencies

function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, '0') + value
}

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Build a PromptPay QR payload string.
 * @param phone        Thai mobile number, e.g. "0637317929"
 * @param amount       Amount in baht (omit for open-amount static QR)
 * @param merchantName Merchant name shown in the payer's banking app (TLV 59, max ~25 chars)
 * @param merchantCity Merchant city shown in the payer's banking app (TLV 60, max ~15 chars)
 */
export function buildPromptPayQR(
  phone: string,
  amount?: number,
  merchantName = 'POS MERCHANT',
  merchantCity = 'BANGKOK',
): string {
  const digits = phone.replace(/\D/g, '')
  // 0637317929 → 0066637317929  (drop leading 0, prepend 0066)
  const normalized = '0066' + (digits.startsWith('0') ? digits.slice(1) : digits)

  const accountInfo = [
    tlv('00', 'A000000677010111'),
    tlv('01', normalized),
  ].join('')

  const parts: string[] = [
    tlv('00', '01'),
    tlv('01', amount != null ? '12' : '11'),
    tlv('29', accountInfo),
    tlv('53', '764'),
    ...(amount != null ? [tlv('54', amount.toFixed(2))] : []),
    tlv('58', 'TH'),
    tlv('59', merchantName.slice(0, 25).toUpperCase()),
    tlv('60', merchantCity.slice(0, 15).toUpperCase()),
    '6304',
  ]

  const payload = parts.join('')
  return payload + crc16(payload)
}
