import { dmRecipientFromUser, formatMarketWinDm, formatWithdrawalSentDm, sendSphereDm } from './sphereDm.mjs'

const MAX_PER_RUN = Number(process.env.DM_MAX_PER_RUN || 20)

export async function queueMarketWinDm(db, user, { payout, question, marketId, positionId }) {
  const recipient = dmRecipientFromUser(user)
  const content = formatMarketWinDm({ payout, question })
  return insertOutboundDm(db, {
    userId: user?.id,
    recipient,
    content,
    kind: 'market_win',
    metadata: { marketId, positionId, payout },
  })
}

export async function queueWithdrawalSentDm(db, user, { amount, txReference, withdrawalId, paymentMemo }) {
  const recipient = dmRecipientFromUser(user)
  const content = formatWithdrawalSentDm({ amount, txReference })
  return insertOutboundDm(db, {
    userId: user?.id,
    recipient,
    content,
    kind: 'withdrawal_sent',
    metadata: { withdrawalId, amount, txReference, payment_memo: paymentMemo },
  })
}

async function insertOutboundDm(db, { userId, recipient, content, kind, metadata }) {
  if (!recipient) {
    const { data, error } = await db.from('outbound_dms').insert({
      user_id: userId,
      recipient: 'unknown',
      content,
      kind,
      status: 'skipped',
      failure_reason: 'User has no nametag or wallet address for Sphere DM',
      metadata,
    }).select('id').single()
    if (error) throw error
    return data
  }

  const { data, error } = await db.from('outbound_dms').insert({
    user_id: userId,
    recipient,
    content,
    kind,
    status: 'pending',
    metadata,
  }).select('id').single()
  if (error) throw error
  return data
}

export async function processOutboundDms(db, sphere, { dryRun = false } = {}) {
  const { data: pending, error } = await db.from('outbound_dms')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) throw error
  if (!pending?.length) return 0

  if (dryRun) {
    console.log(`[dm-worker] dry-run — would send ${pending.length} DM(s)`)
    return pending.length
  }

  let sent = 0
  for (const row of pending) {
    try {
      await sendSphereDm(sphere, row.recipient, row.content)
      await db.from('outbound_dms').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        failure_reason: null,
      }).eq('id', row.id)
      console.log(`[dm-worker] sent ${row.kind} → ${row.recipient} (${row.id})`)
      sent += 1
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      await db.from('outbound_dms').update({
        status: 'failed',
        failure_reason: reason.slice(0, 500),
      }).eq('id', row.id)
      console.warn(`[dm-worker] failed ${row.id}:`, reason)
    }
  }

  return sent
}