import { useState, useEffect, useCallback } from 'react'
import { useWalletConnect } from './useWalletConnect'
import { useMarkets } from './useMarkets'
import './App.css'

const ADMIN_NAMETAG = 'sphere-predict'
const ADMIN_DIRECT_ADDRESS = 'DIRECT://00003db7de43899584dd9a5306096750f32e4c06b201c8e99adf4b8e34e4f2d94dde41318434'

function isAdminIdentity(identity) {
  if (!identity) return false
  const nametag = String(identity.nametag || '').replace(/^@/, '').toLowerCase()
  const directAddress = String(identity.directAddress || '').toUpperCase()
  return nametag === ADMIN_NAMETAG || directAddress === ADMIN_DIRECT_ADDRESS.toUpperCase()
}

function yesPct(m) {
  const t = (m.yesPool || 0) + (m.noPool || 0)
  if (!t) return 50
  return Math.round((m.yesPool / t) * 100)
}
function yesOdds(m) {
  if (!m.yesPool) return '∞'
  const t = (m.yesPool || 0) + (m.noPool || 0)
  return (t / m.yesPool).toFixed(2) + 'x'
}
function noOdds(m) {
  if (!m.noPool) return '∞'
  const t = (m.yesPool || 0) + (m.noPool || 0)
  return (t / m.noPool).toFixed(2) + 'x'
}
function timeLeft(dl) {
  const d = dl - Date.now()
  if (d < 0) return 'ENDED'
  const days = Math.floor(d / 86_400_000)
  if (days > 1) return days + 'd left'
  const hrs = Math.floor(d / 3_600_000)
  if (hrs > 0) return hrs + 'h left'
  return 'Closing soon'
}
function shortAddr(addr) {
  if (!addr) return '—'
  if (addr.startsWith('@')) return addr
  return addr.slice(0, 10) + '…'
}

function proofLabel(proof) {
  if (!proof) return 'UNVERIFIED'
  if (proof.verified) return 'SPHERE SIGNED'
  if (proof.signed) return 'SIGNATURE FAILED'
  return 'LEGACY'
}

function ConnectScreen({ wallet }) {
  const [showMethods, setShowMethods] = useState(false)

  if (wallet.isAutoConnecting) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="logo connect-logo">SPHERE<span>//</span>PREDICT</div>
          <div className="loading-spinner" />
          <p className="connect-sub">Connecting to Sphere wallet…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="connect-screen">
      <div className="connect-card">
        <div className="logo connect-logo">SPHERE<span>//</span>PREDICT</div>
        <h1 className="connect-title">Prediction Markets</h1>
        <p className="connect-sub">
          Connect your Sphere wallet to sign access, send UCT, and start predicting.
          No new wallet is created — use your existing Sphere account.
        </p>

        {!showMethods ? (
          <button
            className="btn-primary connect-btn"
            disabled={wallet.isConnecting}
            onClick={() => setShowMethods(true)}
          >
            {wallet.isConnecting ? 'Connecting…' : 'Connect Sphere Wallet'}
          </button>
        ) : (
          <div className="connect-methods">
            <button className="btn-primary connect-btn" disabled={wallet.isConnecting} onClick={wallet.connect}>
              {wallet.isConnecting ? 'Connecting…' : 'Auto (recommended)'}
            </button>
            {wallet.extensionInstalled && (
              <button className="btn-ghost" disabled={wallet.isConnecting} onClick={wallet.connectViaExtension}>
                Browser extension
              </button>
            )}
            <button className="connect-cancel" onClick={() => setShowMethods(false)}>Back</button>
          </div>
        )}

        {wallet.error && <p className="connect-error">{wallet.error}</p>}
        <p className="connect-hint">
          New to Sphere and don't have a wallet?{' '}
          <a href="https://sphere.unicity.network" target="_blank" rel="noreferrer">
            Create one here
          </a>.
        </p>
      </div>
    </div>
  )
}

function Ticker({ markets }) {
  const items = markets.length
    ? markets.map(m => ({
        id: m.id,
        question: m.question,
        status: m.status,
        category: m.category || 'GENERAL',
        yes: yesPct(m),
        pot: ((m.yesPool || 0) + (m.noPool || 0)).toLocaleString(),
        resolution: m.resolution,
      }))
    : []

  if (!items.length) return <div className="ticker-bar"><span className="tick-dim">No markets yet</span></div>

  const renderItem = (m) => (
    <span key={m.id} className="tick-item">
      <span className="tick-label">{m.category}</span>
      <span className="tick-question">{m.question}</span>
      <span className="tick-yes">Y {m.yes}%</span>
      <span className="tick-no">POT {m.pot} UCT</span>
      <span className={`tick-status status-${m.status}`}>
        {m.status === 'resolved' ? `RESOLVED ${m.resolution || ''}`.trim() : m.status.toUpperCase()}
      </span>
    </span>
  )

  return (
    <div className="ticker-bar">
      <div className="ticker-viewport" aria-label="Market headlines">
        <div className="ticker-track">
          <div className="ticker-group">
            {items.map(renderItem)}
          </div>
          <div className="ticker-group" aria-hidden="true">
            {items.map(renderItem)}
          </div>
        </div>
      </div>
    </div>
  )
}

function MarketCard({ market, onClick }) {
  const yp = yesPct(market)
  const resClass = market.resolution ? `resolved-${market.resolution.toLowerCase()}` : ''
  const pot = ((market.yesPool || 0) + (market.noPool || 0)).toLocaleString()
  const proof = market.resolutionProof || market.proof
  return (
    <div className={`mcard ${resClass}`} onClick={() => onClick(market)}>
      <div className="mcard-tag">
        <span className={`tag-dot ${market.status}`} />
        {market.category || 'GENERAL'} · {market.status.toUpperCase()}
      </div>
      <div className="mcard-q">{market.question}</div>
      <div className="odds-bar-wrap">
        <div className="odds-labels">
          <span className="odds-yes">YES {yp}%</span>
          <span className="odds-no">NO {100 - yp}%</span>
        </div>
        <div className="odds-bar"><div className="odds-fill" style={{ width: yp + '%' }} /></div>
      </div>
      <div className="mcard-footer">
        <span>Pool: <span className="mcard-pot">{pot} UCT</span></span>
        <span>{(market.bets || []).length} bets · {timeLeft(market.deadline)}</span>
        <span className={`proof-badge proof-${proof?.verified ? 'ok' : proof?.signed ? 'bad' : 'legacy'}`}>
          {proofLabel(proof)}
        </span>
        {market.resolution && (
          <span className={`resolution-badge res-${market.resolution.toLowerCase()}`}>RESOLVED {market.resolution}</span>
        )}
      </div>
    </div>
  )
}

function BetModal({ market, balanceHuman, onBet, onClose }) {
  const [side, setSide] = useState(null)
  const [amount, setAmount] = useState('')
  const [betting, setBetting] = useState(false)
  const [msg, setMsg] = useState('')

  const yp = yesPct(market)
  const totalPool = (market.yesPool || 0) + (market.noPool || 0)
  const proof = market.resolutionProof || market.proof

  function calcPayout() {
    const a = parseFloat(amount) || 0
    if (!side || a <= 0) return null
    const pool = side === 'YES' ? (market.yesPool || 0) : (market.noPool || 0)
    const newPool = pool + a
    return Math.round((a / newPool) * (totalPool + a))
  }

  async function handleBet() {
    const a = parseFloat(amount)
    if (!side || !a || a <= 0) return
    setBetting(true)
    setMsg('Approve transfer in your Sphere wallet…')
    try {
      await onBet({ market, side, amountHuman: a })
      setMsg('✓ Bet confirmed!')
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg(e.message || 'Transfer failed')
    }
    setBetting(false)
  }

  async function copyShareCode() {
    if (!market.shareCode) return
    try {
      await navigator.clipboard.writeText(market.shareCode)
    } catch { /* ignore */ }
  }

  const payout = calcPayout()
  const bal = parseFloat(String(balanceHuman).replace(/,/g, '')) || 0

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-header">
          <div className="modal-tag">{market.category} · {market.status.toUpperCase()} · {(market.bets || []).length} BETS</div>
          <div className="modal-title">{market.question}</div>
        </div>
        <div className="modal-body">
          <div className="share-row">
            <div className="share-code">{market.shareCode ? market.shareCode.slice(0, 42) + '…' : 'No share code yet'}</div>
            {market.shareCode && <button className="btn-ghost share-copy" onClick={copyShareCode}>Copy share code</button>}
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-label">TOTAL POT</div>
              <div className="stat-val gold">{totalPool.toLocaleString()} UCT</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">YES ODDS</div>
              <div className="stat-val green">{yesOdds(market)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">NO ODDS</div>
              <div className="stat-val red">{noOdds(market)}</div>
            </div>
          </div>

          <div className={`market-proof ${proof?.verified ? 'proof-ok' : proof?.signed ? 'proof-bad' : 'proof-legacy'}`}>
            <span>{proofLabel(proof)}</span>
            <span>{proof?.publicKey ? shortAddr(proof.publicKey) : 'No signature'}</span>
          </div>

          <div className="odds-bar-wrap" style={{ marginBottom: '1.5rem' }}>
            <div className="odds-labels">
              <span className="odds-yes">YES {yp}%</span>
              <span className="odds-no">NO {100 - yp}%</span>
            </div>
            <div className="odds-bar"><div className="odds-fill" style={{ width: yp + '%' }} /></div>
          </div>

          {market.status === 'open' ? (
            <div className="bet-section">
              <div className="bet-title">PLACE YOUR BET · Balance: {balanceHuman} UCT</div>
              <div className="bet-choices">
                <button className={`bet-choice${side === 'YES' ? ' selected-yes' : ''}`} onClick={() => setSide('YES')}>
                  <div className="choice-label choice-yes">YES</div>
                  <div className="choice-odds">{yesOdds(market)} if correct</div>
                </button>
                <button className={`bet-choice${side === 'NO' ? ' selected-no' : ''}`} onClick={() => setSide('NO')}>
                  <div className="choice-label choice-no">NO</div>
                  <div className="choice-odds">{noOdds(market)} if correct</div>
                </button>
              </div>
              <input className="bet-input" type="number" min="1" placeholder="Amount (UCT)" value={amount}
                onChange={e => setAmount(e.target.value)} />
              <div className="bet-presets">
                {[25, 50, 100, 250, 500, 1000].map(n => (
                  <button key={n} className="preset-btn" onClick={() => setAmount(String(n))}>{n >= 1000 ? '1K' : n}</button>
                ))}
              </div>
              <div className="payout-preview">
                <span>Potential payout if correct</span>
                <span className="payout-val">{payout ? payout.toLocaleString() + ' UCT' : '— UCT'}</span>
              </div>
              {msg && <div className="bet-msg">{msg}</div>}
              <button
                className="btn-bet"
                disabled={!side || !amount || betting || (parseFloat(amount) > bal)}
                onClick={handleBet}
              >
                {betting ? 'Waiting for wallet…' : side ? `BET ${amount || '?'} UCT ON ${side}` : 'SELECT A SIDE TO BET'}
              </button>
            </div>
          ) : market.status === 'resolved' ? (
            <div className={`resolution-display res-${market.resolution?.toLowerCase()}`}>✓ RESOLVED: {market.resolution}</div>
          ) : (
            <div className="resolution-display res-pending">⏸ MARKET CLOSED · AWAITING ORACLE RESOLUTION</div>
          )}

          <div className="bets-list-title">RECENT ACTIVITY</div>
          {(market.bets || []).length === 0 ? (
            <div className="empty-bets">No bets yet — be first!</div>
          ) : (
            [...(market.bets || [])].sort((a, b) => b.ts - a.ts).slice(0, 12).map((b, i) => (
              <div key={i} className="bet-entry">
                <span className="bet-who">{shortAddr(b.who)}</span>
                <span className={`bet-side-${b.side?.toLowerCase()}`}>{b.side}</span>
                <span className="bet-amt">{b.amount?.toLocaleString()} UCT</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const wallet = useWalletConnect()
  const adminConnected = isAdminIdentity(wallet.identity)
  const { markets, positions, createMarket, placeBet, resolveMarket, importMarketShare } = useMarkets({
    identity: wallet.identity,
    sendPayment: wallet.sendPayment,
    refreshBalance: wallet.refreshBalance,
    signMessage: wallet.signMessage,
    sendDM: wallet.sendDM,
    adminDirectAddress: ADMIN_DIRECT_ADDRESS,
    isAdmin: adminConnected,
  })

  const [page, setPage] = useState('markets')
  const [filter, setFilter] = useState('all')
  const [openMarket, setOpenMarket] = useState(null)
  const [toast, setToast] = useState(null)
  const [newQ, setNewQ] = useState('')
  const [newCat, setNewCat] = useState('CRYPTO')
  const [newDays, setNewDays] = useState(7)
  const [creating, setCreating] = useState(false)
  const [importCode, setImportCode] = useState('')
  const activePage = adminConnected || page !== 'admin' ? page : 'markets'

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setOpenMarket(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!wallet.isConnected || !wallet.on) return undefined
    const unsubscribe = wallet.on('message:dm', async (message) => {
      const content = message?.content || ''
      if (!content.startsWith('SPHERE_PREDICT_SYNC:')) return
      try {
        await importMarketShare(content)
        showToast('Market sync received', 'info')
      } catch {
        showToast('Ignored invalid market sync', 'error')
      }
    })
    return unsubscribe
  }, [wallet, importMarketShare, showToast])

  if (!wallet.isConnected) {
    return <ConnectScreen wallet={wallet} />
  }

  if (wallet.isWalletLocked) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="logo connect-logo">SPHERE<span>//</span>PREDICT</div>
          <p className="connect-sub">Wallet locked. Unlock in Sphere and reconnect.</p>
          <button className="btn-primary connect-btn" onClick={wallet.connect}>Reconnect</button>
        </div>
      </div>
    )
  }

  const identity = wallet.identity
  const addr = identity?.nametag || shortAddr(identity?.directAddress)
  const filtered = filter === 'all' ? markets : markets.filter(m => m.status === filter)

  async function handleCreateMarket() {
    if (!newQ.trim()) { showToast('Enter a question', 'error'); return }
    setCreating(true)
    try {
      await createMarket({ question: newQ.trim(), category: newCat, daysOpen: newDays })
      setNewQ('')
      showToast('Market created!')
    } catch (e) {
      showToast(e.message, 'error')
    }
    setCreating(false)
  }

  async function handleImportMarket() {
    if (!importCode.trim()) { showToast('Paste a market share code', 'error'); return }
    try {
      const imported = await importMarketShare(importCode.trim())
      if (!imported) throw new Error('Invalid or unsigned market code')
      setImportCode('')
      showToast('Market imported', 'success')
      setOpenMarket(imported)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function handleResolve(market, resolution) {
    if (!confirm(`Resolve as ${resolution}? Winners will be paid via your wallet.`)) return
    try {
      await resolveMarket({ market, resolution })
      showToast(`Resolved ${resolution} — payouts sent`, 'success')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const totalStaked = positions.reduce((s, p) => s + p.stake, 0)
  const potReturn = positions.filter(p => p.status === 'pending').reduce((s, p) => s + (p.potentialPayout || 0), 0)
  const totalWon = positions.filter(p => p.status === 'won').reduce((s, p) => s + (p.potentialPayout || 0), 0)
  const resolvable = markets.filter(m => m.status === 'open' || m.status === 'closed')

  return (
    <div className="app">
      <header>
        <div className="logo">SPHERE<span>//</span>PREDICT</div>
        <nav className="nav-tabs">
          {['markets', 'portfolio', ...(adminConnected ? ['admin'] : [])].map(p => (
            <button key={p} className={`nav-tab${activePage === p ? ' active' : ''}`} onClick={() => setPage(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </nav>
        <div className="wallet-pill">
          <span className="dot" />
          <span className="addr">{addr}</span>
          <span className="bal">{wallet.balanceHuman} UCT</span>
          <button className="wallet-disconnect" onClick={wallet.disconnect} title="Disconnect">✕</button>
        </div>
      </header>

      <Ticker markets={markets} />

      <main>
        {activePage === 'markets' && (
          <div className="page active">
            <div className="page-header">
              <div>
                <div className="page-title">Prediction Markets</div>
                <div className="page-sub">POWERED BY SPHERE SDK · TESTNET · LIVE ODDS</div>
              </div>
            </div>
            <div className="import-strip">
              <input
                className="field-input import-input"
                value={importCode}
                onChange={e => setImportCode(e.target.value)}
                placeholder="Paste a Sphere market share code"
              />
              <button className="btn-primary" onClick={handleImportMarket}>Import market</button>
            </div>
            <div className="filter-row">
              {['all', 'open', 'closed', 'resolved'].map(f => (
                <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'ALL MARKETS' : f.toUpperCase()}
                </button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="empty-state"><span>🔍</span>No {filter} markets found</div>
            ) : (
              <div className="markets-grid">
                {filtered.map(m => <MarketCard key={m.id} market={m} onClick={setOpenMarket} />)}
              </div>
            )}
          </div>
        )}

        {activePage === 'portfolio' && (
          <div className="page active">
            <div className="page-header">
              <div>
                <div className="page-title">My Portfolio</div>
                <div className="page-sub">YOUR POSITIONS & RETURNS</div>
              </div>
            </div>
            <div className="portfolio-summary">
              <div className="port-stat">
                <div className="port-stat-label">WALLET BALANCE</div>
                <div className="port-stat-val">{wallet.balanceHuman} UCT</div>
              </div>
              <div className="port-stat">
                <div className="port-stat-label">TOTAL STAKED</div>
                <div className="port-stat-val">{totalStaked.toLocaleString()} UCT</div>
              </div>
              <div className="port-stat">
                <div className="port-stat-label">POTENTIAL RETURN</div>
                <div className="port-stat-val">{potReturn.toLocaleString()} UCT</div>
              </div>
              <div className="port-stat">
                <div className="port-stat-label">TOTAL WON</div>
                <div className="port-stat-val green">{totalWon.toLocaleString()} UCT</div>
              </div>
            </div>
            {positions.length === 0 ? (
              <div className="empty-state"><span>📭</span>No positions yet. Go place some bets!</div>
            ) : (
              <div className="position-list">
                {[...positions].reverse().map((p, i) => (
                  <div key={i} className="position-item">
                    <span className={`pos-side-badge pos-${p.side.toLowerCase()}`}>{p.side}</span>
                    <div className="pos-q">{p.question}</div>
                    <div className="pos-numbers">
                      <div className="pos-stake">{p.stake.toLocaleString()} UCT staked</div>
                      <div className="pos-payout">{p.potentialPayout > 0 ? p.potentialPayout.toLocaleString() + ' UCT' : '—'}</div>
                    </div>
                    <span className={`pos-status pos-${p.status}`}>{p.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activePage === 'admin' && adminConnected && (
          <div className="page active">
            <div className="page-header">
              <div>
                <div className="page-title">Admin Console</div>
                <div className="page-sub">CREATE & RESOLVE MARKETS</div>
              </div>
            </div>
            <div className="admin-grid">
              <div className="admin-card admin-span">
                <div className="admin-card-title">CREATE NEW MARKET</div>
                <div className="field-label">QUESTION</div>
                <textarea className="field-textarea" value={newQ} onChange={e => setNewQ(e.target.value)}
                  placeholder="Will BTC reach $200k by end of 2026?" />
                <div className="form-row">
                  <div>
                    <div className="field-label">CATEGORY</div>
                    <select className="field-select" value={newCat} onChange={e => setNewCat(e.target.value)}>
                      {['CRYPTO', 'SPORTS', 'POLITICS', 'TECH', 'FINANCE', 'OTHER'].map(c => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="field-label">CLOSES IN (DAYS)</div>
                    <input className="field-input" type="number" min={1} max={730} value={newDays}
                      onChange={e => setNewDays(Number(e.target.value))} />
                  </div>
                </div>
                <button className="btn-primary" disabled={creating} onClick={handleCreateMarket}>
                  {creating ? 'Creating…' : '+ CREATE MARKET'}
                </button>
              </div>

              <div className="admin-card admin-span">
                <div className="admin-card-title">RESOLVE OPEN MARKETS</div>
                {resolvable.length === 0 ? (
                  <div className="empty-state admin-empty">No open markets to resolve yet</div>
                ) : (
                  resolvable.map(m => (
                    <div key={m.id} className="resolve-market-item">
                      <div className="resolve-q">{m.question}</div>
                      <div className="resolve-btns">
                        <button className="btn-res-yes" onClick={() => handleResolve(m, 'YES')}>YES</button>
                        <button className="btn-res-no" onClick={() => handleResolve(m, 'NO')}>NO</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {openMarket && (
        <BetModal
          market={openMarket}
          balanceHuman={wallet.balanceHuman}
          onBet={async args => {
            await placeBet(args)
            showToast('Bet placed on-chain!')
          }}
          onClose={() => setOpenMarket(null)}
        />
      )}

      {toast && <div className={`toast toast-${toast.type} show`}>{toast.msg}</div>}
    </div>
  )
}
