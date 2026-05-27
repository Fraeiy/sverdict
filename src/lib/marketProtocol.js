import { verifySignedMessage } from '@unicitylabs/sphere-sdk'

export const MARKET_PROTOCOL_VERSION = 'sphere-predict-v1'

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortValue(value[key])
        return result
      }, {})
  }
  return value
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value))
}

export function buildSignedPayload(kind, data) {
  return `${MARKET_PROTOCOL_VERSION}:${kind}:${stableStringify(data)}`
}

export function verifyPayloadSignature(message, signature, publicKey) {
  if (!message || !signature || !publicKey) return false
  try {
    return verifySignedMessage(message, signature, publicKey)
  } catch {
    return false
  }
}

function base64UrlEncode(text) {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(text)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }
  return text
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(padded)))
  }
  return padded
}

export function encodeMarketPacket(packet) {
  return `SPHERE_PREDICT_SYNC:${base64UrlEncode(JSON.stringify(packet))}`
}

export function decodeMarketPacket(content) {
  if (!content || typeof content !== 'string') return null
  const prefix = 'SPHERE_PREDICT_SYNC:'
  if (!content.startsWith(prefix)) return null
  try {
    return JSON.parse(base64UrlDecode(content.slice(prefix.length)))
  } catch {
    return null
  }
}
