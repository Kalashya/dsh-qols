/**
 * Wallet balance through the host account service, cached.
 *
 * The account service is host-only: it holds the login and never exposes the
 * token to a plugin. `getBalance` is slow (network, up to 30 s in the host), so
 * the status route never waits for it: it returns the cached value and triggers
 * a background refresh when the snapshot is older than the TTL.
 *
 * Wallets keep their own currency. Bonus (granted) wallets come first, then the
 * topped-up ones, so the card can show "grant ¥…" and "$…" without converting.
 */

const DEFAULT_TTL_MS = 60_000
const DEFAULT_RETRY_MS = 8_000
/** While the account service is not mounted yet, retry almost immediately. */
const UNKNOWN_RETRY_MS = 1_000

function walletsOf(list, kind) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    const currency = typeof entry.currency === 'string' ? entry.currency.toUpperCase() : ''
    const amount = Number(entry.balance)
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount)) continue
    out.push({ currency, amount, kind })
  }
  return out
}

export class BalanceCache {
  /** @param {{ getAccount?: () => object | undefined, log?: (message: string) => void, ttlMs?: number, retryMs?: number, now?: () => number }} [options] */
  constructor(options = {}) {
    this.getAccount = typeof options.getAccount === 'function' ? options.getAccount : () => undefined
    this.log = typeof options.log === 'function' ? options.log : () => {}
    this.ttlMs = Number.isFinite(options.ttlMs) ? Math.max(5_000, options.ttlMs) : DEFAULT_TTL_MS
    this.retryMs = Number.isFinite(options.retryMs) ? Math.max(1_000, options.retryMs) : DEFAULT_RETRY_MS
    this.now = typeof options.now === 'function' ? options.now : () => Date.now()
    /** @type {{ state: string, wallets: object[], at: number | null, error?: string } | null} */
    this.last = null
    this.inFlight = false
  }

  /** Cached snapshot; starts a refresh when stale. Never blocks on the network. */
  snapshot() {
    // A ready snapshot is refreshed once per TTL. Anything else (not signed in
    // yet, account service still booting, a network failure) retries quickly:
    // at startup the account often appears seconds after this plugin.
    const age = this.last === null || this.last.at === null ? Infinity : this.now() - this.last.at
    const unknown = this.last !== null && this.last.state === 'unknown'
    const retry = this.last !== null && this.last.state !== 'ready' && !unknown
    const delay = unknown ? UNKNOWN_RETRY_MS : retry ? this.retryMs : this.ttlMs
    if (this.last === null || age > delay) void this.refresh()
    if (this.last === null) return { state: 'unknown', wallets: [], at: null, stale: true }
    return {
      state: this.last.state,
      wallets: this.last.wallets.map((wallet) => ({ ...wallet })),
      at: this.last.at === null ? null : new Date(this.last.at).toISOString(),
      stale: this.last.state !== 'ready',
      error: this.last.error,
    }
  }

  /**
   * First answer, bounded.
   *
   * At startup the account service is mounted by the host, sometimes after this
   * plugin, and its first network call is slow. The status route uses this so
   * the card's Today and Balance rows can be painted in the same frame instead
   * of Balance popping in five seconds later. Returns whatever is known when
   * `timeoutMs` runs out — never throws.
   */
  async settled(timeoutMs = 2_500) {
    if (this.last !== null && this.last.state !== 'unknown') return this.snapshot()
    const deadline = Date.now() + Math.max(0, timeoutMs)
    void this.refresh()
    while ((this.last === null || this.last.state === 'unknown') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      if (this.last === null || this.last.state === 'unknown') void this.refresh()
    }
    return this.snapshot()
  }

  async refresh() {
    if (this.inFlight) return
    this.inFlight = true
    try {
      const account = this.getAccount()
      if (account === null || typeof account !== 'object' || typeof account.getBalance !== 'function') {
        // Not mounted yet is not the same as signed out: retrying this in a
        // second is cheap, while claiming "signed out" would hide the row for
        // the whole TTL and make Balance appear long after Today.
        this.last = { state: 'unknown', wallets: [], at: null, error: 'the account service is not available yet' }
        return
      }
      const details = await account.getBalance({
        version: '',
        locale: 'en',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      })
      if (details === null || typeof details !== 'object' || details.status !== 'ready') {
        this.last = { state: 'signed-out', wallets: [], at: this.now() }
        return
      }
      const wallets = [...walletsOf(details.bonusWallets, 'grant'), ...walletsOf(details.value, 'topup')]
      this.last = { state: wallets.length > 0 ? 'ready' : 'signed-out', wallets, at: this.now() }
    } catch (error) {
      const previous = this.last !== null && this.last.state === 'ready' ? this.last : null
      this.last = {
        state: previous === null ? 'failed' : 'ready',
        wallets: previous === null ? [] : previous.wallets,
        at: previous === null ? this.now() : previous.at,
        error: error instanceof Error ? error.message : String(error),
      }
      this.log(`[qols-usage] balance unavailable: ${this.last.error}`)
    } finally {
      this.inFlight = false
    }
  }
}
