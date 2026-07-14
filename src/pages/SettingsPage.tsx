import { useState, type ReactNode } from 'react'
import { useNotifications } from '../hooks/useNotifications'
import { usePlatform } from '../hooks/usePlatform'
import { useUserSettings } from '../hooks/useUserSettings'
import { getBackendMode } from '../lib/config'
import { BRAND_NAME } from '../lib/brand'
import { displayName } from '../lib/format'
import { clearConnectSession } from '../lib/userSettings'
import type { WalletIdentity } from '../lib/types'

type Props = {
  identity: WalletIdentity | null
  onDisconnect: () => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function SettingToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div
      role="group"
      className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-4)] p-0.5 font-data text-[10px] font-bold uppercase tracking-wider"
    >
      {(['off', 'on'] as const).map(option => {
        const isOn = option === 'on'
        const active = checked === isOn
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(isOn)}
            className={`min-w-[3.25rem] rounded px-3 py-1.5 transition ${
              active
                ? 'bg-[var(--color-gold)] text-[#111]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text-2)]'
            } disabled:opacity-40`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="label-caps mb-4 text-[var(--color-gold)]">{title}</h2>
      {children}
    </section>
  )
}

function truncateMiddle(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function SettingsPage({ identity, onDisconnect, onToast }: Props) {
  const platform = usePlatform(identity)
  const { preferences, loading, saving, error, updatePreferences } = useUserSettings(identity)
  const { notifications, unread, loading: notifLoading, markAllRead, markRead } = useNotifications(identity)
  const [stakeDraft, setStakeDraft] = useState<string | null>(null)

  const stakeValue = stakeDraft ?? String(preferences.defaultStake)

  async function patchPrefs(patch: Parameters<typeof updatePreferences>[0]) {
    try {
      await updatePreferences(patch)
      onToast('Settings saved', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to save settings', 'error')
    }
  }

  function handleDisconnect() {
    clearConnectSession()
    onDisconnect()
  }

  const quickStakes = Array.from(new Set([10, 25, 50, 100, preferences.defaultStake])).sort((a, b) => a - b)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-2 text-sm text-[var(--color-text-2)]">
        Account, notifications, and trading preferences.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm text-[var(--color-text-2)]">
          {error}
        </div>
      )}

      <div className="mt-8 space-y-6">
        <Section title="Account">
          <div className="space-y-3 font-data text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted)]">Display name</span>
              <span className="font-bold text-[var(--color-gold)]">{displayName(identity)}</span>
            </div>
            {platform.user?.wallet_address && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-muted)]">Wallet</span>
                <span className="text-[var(--color-text-2)]" title={platform.user.wallet_address}>
                  {truncateMiddle(platform.user.wallet_address)}
                </span>
              </div>
            )}
            {identity?.directAddress && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-muted)]">Direct address</span>
                <span className="text-[var(--color-text-2)]" title={identity.directAddress}>
                  {truncateMiddle(identity.directAddress)}
                </span>
              </div>
            )}
            {platform.isAdmin && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--color-muted)]">Role</span>
                <span className="chip chip-gold">Admin</span>
              </div>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            className="btn-ghost mt-6 w-full rounded-lg px-4 py-3 font-data text-[10px] font-bold uppercase tracking-wider"
          >
            Disconnect wallet
          </button>
        </Section>

        <Section title="Notifications">
          {getBackendMode() === 'supabase' && (
            <div className="mb-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="label-caps">In-app</p>
                {unread > 0 && (
                  <button
                    onClick={() => markAllRead().catch(() => onToast('Failed to mark read', 'error'))}
                    className="font-data text-[10px] text-[var(--color-gold)] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifLoading ? (
                <p className="font-data text-xs text-[var(--color-muted)]">Loading notifications…</p>
              ) : notifications.length === 0 ? (
                <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-4)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
                  No notifications yet
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {notifications.map(n => (
                    <li
                      key={n.id}
                      className={`rounded-lg border px-4 py-3 ${
                        n.read
                          ? 'border-[var(--color-border)] bg-[var(--color-surface-4)] opacity-70'
                          : 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.06)]'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          if (!n.read) markRead(n.id).catch(() => {})
                        }}
                      >
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-2)]">{n.body}</p>
                        <p className="mt-2 font-data text-[9px] text-[var(--color-muted)]">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="label-caps mb-2">Sphere DMs</p>
          <SettingRow
            label="Win notifications"
            description="Receive a Sphere DM when you win on a resolved market."
          >
            <SettingToggle
              checked={preferences.dmOnWin}
              disabled={loading || saving}
              onChange={v => patchPrefs({ dmOnWin: v })}
            />
          </SettingRow>
          <SettingRow
            label="Withdrawal notifications"
            description="Receive a Sphere DM when a withdrawal is sent to your wallet."
          >
            <SettingToggle
              checked={preferences.dmOnWithdrawal}
              disabled={loading || saving}
              onChange={v => patchPrefs({ dmOnWithdrawal: v })}
            />
          </SettingRow>
        </Section>

        <Section title="Trading">
          <SettingRow
            label="Default stake"
            description="Pre-filled amount when opening a market."
          >
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={10000}
              value={stakeValue}
              disabled={loading || saving}
              onChange={e => setStakeDraft(e.target.value)}
              onBlur={() => {
                const n = parseFloat(stakeValue)
                if (n > 0 && n <= 10_000) {
                  setStakeDraft(null)
                  patchPrefs({ defaultStake: n })
                } else {
                  setStakeDraft(null)
                  onToast('Stake must be between 1 and 10,000 UCT', 'error')
                }
              }}
              className="input-pro w-24 rounded-md px-3 py-2 text-right text-sm"
            />
          </SettingRow>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickStakes.map(n => (
              <button
                key={n}
                type="button"
                disabled={loading || saving}
                onClick={() => {
                  setStakeDraft(null)
                  patchPrefs({ defaultStake: n })
                }}
                className={`btn-ghost rounded-md px-3 py-1.5 font-data text-[10px] ${
                  preferences.defaultStake === n ? 'border-[rgba(245,158,11,0.5)] text-[var(--color-gold)]' : ''
                }`}
              >
                {n} UCT
              </button>
            ))}
          </div>

          <SettingRow
            label="Confirm before trade"
            description="Show a confirmation dialog before executing a position."
          >
            <SettingToggle
              checked={preferences.confirmBeforeTrade}
              disabled={loading || saving}
              onChange={v => patchPrefs({ confirmBeforeTrade: v })}
            />
          </SettingRow>
        </Section>

        <Section title="About">
          <div className="space-y-3 text-sm text-[var(--color-text-2)]">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted)]">App</span>
              <span className="font-data font-bold text-[var(--color-text)]">{BRAND_NAME}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted)]">Network</span>
              <span className="font-data">Sphere Testnet · Unicity</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted)]">Backend</span>
              <span className="font-data uppercase">{getBackendMode()}</span>
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-[var(--color-muted)]">
            Portfolio-margin prediction markets. Deposits and withdrawals settle via the Sphere treasury;
            trades execute instantly from your in-app balance.
          </p>
          <a
            href="https://github.com/Fraeiy/sphere-predict"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block font-data text-[11px] text-[var(--color-gold)] hover:underline"
          >
            View on GitHub →
          </a>
        </Section>
      </div>
    </div>
  )
}