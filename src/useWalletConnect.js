import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  ConnectClient,
  HOST_READY_TYPE,
  HOST_READY_TIMEOUT,
  WALLET_EVENTS,
  RPC_METHODS,
  INTENT_ACTIONS,
} from '@unicitylabs/sphere-sdk/connect'
import { PostMessageTransport, ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser'
import { isInIframe, hasExtension } from './lib/detection'
import { toHuman } from './lib/amount'

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network'
const SESSION_KEY_POPUP = 'sphere-connect-popup-session'

const DISCONNECTED = {
  isConnected: false,
  isConnecting: false,
  isWalletLocked: false,
  identity: null,
  permissions: [],
  error: null,
}

function waitForHostReady(timeoutMs = HOST_READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('Wallet popup did not become ready in time'))
    }, timeoutMs)

    function handler(event) {
      if (event.data?.type === HOST_READY_TYPE) {
        clearTimeout(timeout)
        window.removeEventListener('message', handler)
        resolve()
      }
    }
    window.addEventListener('message', handler)
  })
}

export function normalizeRecipient(recipient) {
  // Normalize the recipient into a safe string. Be defensive: recipient
  // may be undefined, an object, or another non-string value coming from
  // various code paths. Ensure we always produce a string before calling
  // string methods like `startsWith`.
  let toRaw
  if (typeof recipient === 'string') {
    toRaw = recipient
  } else if (recipient && typeof recipient === 'object') {
    toRaw = recipient.directAddress ?? recipient.nametag ?? recipient
  } else {
    toRaw = recipient ?? ''
  }

  let to = String(toRaw ?? '').trim()
  if (!to) throw new Error('Missing recipient')

  if (to && typeof to === 'string' && !to.startsWith('@') && !to.startsWith('DIRECT://')) {
    if (/^alpha[0-9a-z]+$/i.test(to)) {
      to = 'DIRECT://' + to
    } else {
      to = '@' + to.replace(/^@/, '')
    }
  }

  return to
}

export function useWalletConnect() {
  const willSilentCheck = isInIframe() || hasExtension() || !!sessionStorage.getItem(SESSION_KEY_POPUP)
  const [isAutoConnecting, setIsAutoConnecting] = useState(willSilentCheck)
  const [state, setState] = useState({ ...DISCONNECTED })
  const [balanceHuman, setBalanceHuman] = useState('—')

  const clientRef = useRef(null)
  const transportRef = useRef(null)
  const popupRef = useRef(null)
  const popupMode = useRef(false)

  const dappMeta = useMemo(() => ({
    name: 'Sphere Predict',
    description: 'Prediction markets on Sphere testnet',
    url: location.origin,
  }), [])

  function normalizeIdentity(id) {
    if (!id) return id
    const copy = { ...id }
    const raw = String(copy.directAddress || '')
    if (raw && !raw.startsWith('DIRECT://') && /^alpha[0-9a-z]+$/i.test(raw)) {
      copy.directAddress = 'DIRECT://' + raw
    }
    return copy
  }

  const refreshBalance = useCallback(async () => {
    const client = clientRef.current
    if (!client?.isConnected) return
    try {
      const assets = await client.query(RPC_METHODS.GET_ASSETS)
      const list = Array.isArray(assets) ? assets : assets?.assets ?? []
      const uct = list.find(a => a.coinId === 'UCT' || a.symbol === 'UCT')
      const raw = uct?.totalAmount ?? uct?.balance ?? 0
      setBalanceHuman(toHuman(raw))
    } catch (err) {
      console.warn('Balance fetch failed:', err)
      setBalanceHuman('?')
    }
  }, [])

  const openPopupAndConnect = useCallback(async () => {
    if (!popupRef.current || popupRef.current.closed) {
      const popup = window.open(
        `${WALLET_URL}/connect?origin=${encodeURIComponent(location.origin)}`,
        'sphere-wallet',
        'width=420,height=720,scrollbars=yes,resizable=yes',
      )
      if (!popup) throw new Error('Popup blocked. Allow popups for this site.')
      popupRef.current = popup
    } else {
      popupRef.current.focus()
    }

    transportRef.current?.destroy()
    const transport = PostMessageTransport.forClient({
      target: popupRef.current,
      targetOrigin: WALLET_URL,
    })
    transportRef.current = transport
    await waitForHostReady()

    const resumeSessionId = sessionStorage.getItem(SESSION_KEY_POPUP) ?? undefined
    const client = new ConnectClient({ transport, dapp: dappMeta, resumeSessionId })
    clientRef.current = client
    const result = await client.connect()
    // Log connection info to help diagnose client-side issues after connect
    // (exposed in browser console). This is intentionally lightweight.
    try { console.info('wallet connected (popup)', result.identity, result.permissions) } catch { /* ignore */ }
    sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId)
    setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
    await refreshBalance()
    return client
  }, [dappMeta, refreshBalance])

  const ensureClient = useCallback(async () => {
    if (clientRef.current && !popupMode.current) return clientRef.current
    if (clientRef.current && popupMode.current && popupRef.current && !popupRef.current.closed) {
      return clientRef.current
    }
    if (popupMode.current && (!popupRef.current || popupRef.current.closed)) {
      transportRef.current?.destroy()
      clientRef.current = null
      transportRef.current = null
      popupRef.current = null
      popupMode.current = false
      setState(DISCONNECTED)
      throw new Error('Wallet popup was closed')
    }
    throw new Error('Not connected')
  }, [])

  const connectViaExtension = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }))
    try {
      popupMode.current = false
      const transport = ExtensionTransport.forClient()
      transportRef.current = transport
      const client = new ConnectClient({ transport, dapp: dappMeta })
      clientRef.current = client
      const result = await client.connect()
      try { console.info('wallet connected (extension)', result.identity, result.permissions) } catch { /* ignore */ }
      setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
      await refreshBalance()
    } catch (err) {
      setState(s => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }))
    }
  }, [dappMeta, refreshBalance])

  const connectViaPopup = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }))
    try {
      if (isInIframe()) {
        popupMode.current = false
        const transport = PostMessageTransport.forClient()
        transportRef.current = transport
        const client = new ConnectClient({ transport, dapp: dappMeta })
        clientRef.current = client
        const result = await client.connect()
        try { console.info('wallet connected (popup-direct)', result.identity, result.permissions) } catch { /* ignore */ }
        setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
        await refreshBalance()
      } else {
        popupMode.current = true
        await openPopupAndConnect()
      }
    } catch (err) {
      setState(s => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }))
    }
  }, [dappMeta, openPopupAndConnect, refreshBalance])

  const connect = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }))
    try {
      if (isInIframe()) {
        popupMode.current = false
        const transport = PostMessageTransport.forClient()
        transportRef.current = transport
        const client = new ConnectClient({ transport, dapp: dappMeta })
        clientRef.current = client
        const result = await client.connect()
        setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
        await refreshBalance()
      } else if (hasExtension()) {
        await connectViaExtension()
      } else {
        await connectViaPopup()
      }
    } catch (err) {
      setState(s => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }))
    }
  }, [dappMeta, connectViaExtension, connectViaPopup, refreshBalance])

  const disconnect = useCallback(async () => {
    try {
      await clientRef.current?.disconnect()
    } catch { /* ignore */ }
    transportRef.current?.destroy()
    clientRef.current = null
    transportRef.current = null
    popupRef.current?.close()
    popupRef.current = null
    popupMode.current = false
    sessionStorage.removeItem(SESSION_KEY_POPUP)
    setState(DISCONNECTED)
    setBalanceHuman('—')
  }, [])

  const handleRequestError = useCallback((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (/not.connected|timeout|transport|closed|session/i.test(msg)) {
      transportRef.current?.destroy()
      clientRef.current = null
      transportRef.current = null
      popupRef.current = null
      popupMode.current = false
      sessionStorage.removeItem(SESSION_KEY_POPUP)
      setState(DISCONNECTED)
      setBalanceHuman('—')
    }
    throw err
  }, [])

  const query = useCallback(async (method, params) => {
    const client = await ensureClient()
    try {
      return await client.query(method, params)
    } catch (err) {
      return handleRequestError(err)
    }
  }, [ensureClient, handleRequestError])

  const intent = useCallback(async (action, params) => {
    const client = await ensureClient()
    try {
      return await client.intent(action, params)
    } catch (err) {
      return handleRequestError(err)
    }
  }, [ensureClient, handleRequestError])

  const signMessage = useCallback(async (message) => {
    if (!message) throw new Error('Missing message to sign')
    const result = await intent(INTENT_ACTIONS.SIGN_MESSAGE ?? 'sign_message', { message })
    if (!result?.signature || !result?.publicKey) {
      throw new Error('Wallet did not return a signature')
    }
    return result
  }, [intent])

  const sendDM = useCallback(async ({ recipient, content }) => {
    if (!recipient) throw new Error('Missing DM recipient')
    if (!content) throw new Error('Missing DM content')
    return await intent(INTENT_ACTIONS.DM ?? 'dm', { recipient: normalizeRecipient(recipient), content })
  }, [intent])

  /** Send UCT — opens Sphere wallet for user to sign & confirm.
   *  amountHuman is the direct human amount in UCT (e.g. 25 for 25 UCT).
   *  We pass the chosen amount directly (as string) since only UCT is used
   *  and the pools/bet records also treat amounts as human UCT numbers.
   *  The wallet/SDK will handle the on-chain units/decimals for the coin.
   */
  const sendPayment = useCallback(async ({ recipient, amountHuman, coinId = 'UCT', memo }) => {
    const to = normalizeRecipient(recipient)
    const params = { to, amount: String(amountHuman), coinId }
    if (memo) params.memo = memo
    const result = await intent(INTENT_ACTIONS.SEND, params)
    await refreshBalance()
    return result
  }, [intent, refreshBalance])

  const on = useCallback((event, handler) => {
    if (!clientRef.current) throw new Error('Not connected')
    return clientRef.current.on(event, handler)
  }, [])

  useEffect(() => {
    if (!state.isConnected || !popupMode.current) return
    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(interval)
        transportRef.current?.destroy()
        clientRef.current = null
        transportRef.current = null
        popupRef.current = null
        popupMode.current = false
        sessionStorage.removeItem(SESSION_KEY_POPUP)
        setState(DISCONNECTED)
        setBalanceHuman('—')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [state.isConnected])

  useEffect(() => {
    if (!state.isConnected || !clientRef.current) return
    const client = clientRef.current
    const unsubLocked = client.on(WALLET_EVENTS.LOCKED, () => {
      if (popupMode.current) {
        transportRef.current?.destroy()
        clientRef.current = null
        transportRef.current = null
        popupRef.current = null
        popupMode.current = false
        sessionStorage.removeItem(SESSION_KEY_POPUP)
        setState(DISCONNECTED)
        setBalanceHuman('—')
      } else {
        setState(s => ({ ...s, isWalletLocked: true }))
      }
    })
    const unsubIdentity = client.on(WALLET_EVENTS.IDENTITY_CHANGED, (data) => {
      setState(s => ({ ...s, isWalletLocked: false, identity: normalizeIdentity(data) }))
      refreshBalance()
    })
    return () => { unsubLocked(); unsubIdentity() }
  }, [state.isConnected, refreshBalance])

  useEffect(() => {
    if (isInIframe()) {
      const silentCheck = async () => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', readyHandler)
            reject(new Error('Host not ready'))
          }, 5000)
          function readyHandler(e) {
            if (e.data?.type === HOST_READY_TYPE) {
              clearTimeout(timer)
              window.removeEventListener('message', readyHandler)
              resolve()
            }
          }
          window.addEventListener('message', readyHandler)
        })
        popupMode.current = false
        const transport = PostMessageTransport.forClient()
        transportRef.current = transport
        const client = new ConnectClient({ transport, dapp: dappMeta, silent: true })
        clientRef.current = client
        try {
          const result = await client.connect()
          setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
          await refreshBalance()
        } catch {
          transportRef.current?.destroy()
          clientRef.current = null
          transportRef.current = null
        }
      }
      silentCheck().finally(() => setIsAutoConnecting(false))
      return
    }

    if (hasExtension()) {
      const silentCheck = async () => {
        popupMode.current = false
        const transport = ExtensionTransport.forClient()
        transportRef.current = transport
        const client = new ConnectClient({ transport, dapp: dappMeta, silent: true })
        clientRef.current = client
        try {
          const result = await client.connect()
          setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions })
          await refreshBalance()
        } catch {
          transportRef.current?.destroy()
          clientRef.current = null
          transportRef.current = null
        }
      }
      silentCheck().finally(() => setIsAutoConnecting(false))
    } else {
      const savedSession = sessionStorage.getItem(SESSION_KEY_POPUP)
      if (savedSession) {
        popupMode.current = true
        const resumePopup = async () => {
          if (!popupRef.current || popupRef.current.closed) {
            const popup = window.open(
              `${WALLET_URL}/connect?origin=${encodeURIComponent(location.origin)}`,
              'sphere-wallet',
              'width=420,height=720,scrollbars=yes,resizable=yes',
            )
            if (!popup) throw new Error('Popup blocked')
            popupRef.current = popup
          }
          transportRef.current?.destroy()
          const transport = PostMessageTransport.forClient({
            target: popupRef.current,
            targetOrigin: WALLET_URL,
          })
          transportRef.current = transport
          await waitForHostReady(5000)
          const client = new ConnectClient({ transport, dapp: dappMeta, resumeSessionId: savedSession, silent: true })
          clientRef.current = client
          const result = await client.connect()
          sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId)
          setState({ ...DISCONNECTED, isConnected: true, identity: normalizeIdentity(result.identity), permissions: result.permissions })
          await refreshBalance()
        }
        resumePopup()
          .catch(() => {
            sessionStorage.removeItem(SESSION_KEY_POPUP)
            transportRef.current?.destroy()
            clientRef.current = null
            transportRef.current = null
            popupRef.current = null
            popupMode.current = false
          })
          .finally(() => setIsAutoConnecting(false))
      } else {
        setIsAutoConnecting(false)
      }
    }
  }, [dappMeta, refreshBalance])

  return {
    ...state,
    balanceHuman,
    connect,
    connectViaExtension,
    connectViaPopup,
    disconnect,
    query,
    intent,
    sendPayment,
    refreshBalance,
    signMessage,
    sendDM,
    on,
    isAutoConnecting,
    extensionInstalled: hasExtension(),
    INTENT_ACTIONS,
    RPC_METHODS,
  }
}
