/**
 * Peak/off-peak schedule for DeepSeek pricing.
 *
 * The official windows are UTC hours: 01:00–04:00 and 06:00–10:00. A window may
 * wrap midnight (start > end), so occurrences are generated for every UTC day
 * that overlaps the range being asked about, then clipped and merged.
 *
 * Since 2026-08-23 weekends are off-peak for the whole Beijing day. Chinese
 * public holidays are off-peak for the whole Beijing day too; the default list
 * mirrors `dsh-cost-meter` and has to be extended once a year. China has no DST,
 * so Beijing time is a fixed UTC+8 and both rules are deterministic.
 *
 * The card renders a local calendar day (00:00–23:59:59 of the machine's zone),
 * which is what `daySchedule` returns: peak windows are converted to local
 * instants and Beijing off-peak days are subtracted from them.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const BEIJING_OFFSET = 8 * HOUR
const SEARCH_DAYS = 10

function utcDayStart(atMs) {
  return Math.floor(atMs / DAY) * DAY
}

/** Beijing calendar day: start of that day (as a UTC instant) and weekday. */
export function beijingDay(atMs) {
  const shifted = atMs + BEIJING_OFFSET
  const dayStart = utcDayStart(shifted)
  return {
    startMs: dayStart - BEIJING_OFFSET,
    endMs: dayStart - BEIJING_OFFSET + DAY,
    weekday: new Date(shifted).getUTCDay(),
  }
}

/** Beijing calendar date as `YYYY-MM-DD`, the key used by the holiday list. */
export function beijingDateKey(atMs) {
  const date = new Date(atMs + BEIJING_OFFSET)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Local calendar day of the machine running the host (matches `dayKey`). */
function localDay(atMs) {
  const date = new Date(atMs)
  return {
    startMs: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    endMs: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(),
    weekday: date.getDay(),
  }
}

function holidaySet(peak) {
  return new Set(Array.isArray(peak?.holidays) ? peak.holidays.filter((value) => typeof value === 'string') : [])
}

/** Why this instant is off-peak for a whole Beijing day, or `null` for a workday. */
function dayOffReason(atMs, peak, holidays) {
  if (peak?.weekendsOffPeak !== false) {
    const weekday = beijingDay(atMs).weekday
    if (weekday === 0 || weekday === 6) return 'weekend'
  }
  if (holidays.has(beijingDateKey(atMs))) return 'holiday'
  return null
}

function segment(atMs, window) {
  const dayStart = utcDayStart(atMs)
  const startMs = dayStart + window.start * HOUR
  let endMs = dayStart + window.end * HOUR
  if (endMs <= startMs) endMs += DAY
  return { startMs, endMs }
}

/** Every window occurrence that intersects `[startMs, endMs)`. */
function occurrencesBetween(startMs, endMs, windows) {
  const out = []
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return out
  const first = utcDayStart(startMs) - DAY
  const last = endMs + DAY
  for (let day = first; day <= last; day += DAY) {
    for (const window of windows) {
      const entry = segment(day, window)
      if (entry.endMs > startMs && entry.startMs < endMs) out.push(entry)
    }
  }
  out.sort((left, right) => left.startMs - right.startMs)
  return out
}

/** Beijing days in the range that are off-peak for the whole day. */
function offPeakZones(startMs, endMs, peak, holidays) {
  const zones = []
  const seen = new Set()
  for (let cursor = beijingDay(startMs - DAY).startMs; cursor < endMs + DAY; cursor += DAY) {
    const day = beijingDay(cursor)
    if (seen.has(day.startMs)) continue
    seen.add(day.startMs)
    const reason = dayOffReason(day.startMs, peak, holidays)
    if (reason !== null) zones.push({ startMs: day.startMs, endMs: day.endMs, reason })
  }
  return zones
}

function subtractIntervals(intervals, cuts) {
  let out = intervals
  for (const cut of cuts) {
    const next = []
    for (const entry of out) {
      if (cut.endMs <= entry.startMs || cut.startMs >= entry.endMs) {
        next.push(entry)
        continue
      }
      if (entry.startMs < cut.startMs) next.push({ startMs: entry.startMs, endMs: cut.startMs })
      if (entry.endMs > cut.endMs) next.push({ startMs: cut.endMs, endMs: entry.endMs })
    }
    out = next
  }
  return out
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter((entry) => entry.endMs > entry.startMs).sort((left, right) => left.startMs - right.startMs)
  const out = []
  for (const entry of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && entry.startMs <= last.endMs) last.endMs = Math.max(last.endMs, entry.endMs)
    else out.push({ startMs: entry.startMs, endMs: entry.endMs })
  }
  return out
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * The local calendar day around `atMs`, split into peak and off-peak segments.
 * Segments cover the whole `[startMs, endMs)` range without gaps.
 *
 * @param {number} atMs
 * @param {{ windows: { start: number, end: number }[], weekendsOffPeak?: boolean, holidays?: string[] }} peak
 * @returns {{ startMs: number, endMs: number, segments: { startMs: number, endMs: number, peak: boolean }[] }}
 */
export function daySchedule(atMs, peak) {
  const day = localDay(atMs)
  const windows = Array.isArray(peak?.windows) ? peak.windows : []
  const holidays = holidaySet(peak)
  const cuts = offPeakZones(day.startMs, day.endMs, peak, holidays)

  const raw = []
  for (const entry of occurrencesBetween(day.startMs, day.endMs, windows)) {
    const clipped = {
      startMs: Math.max(entry.startMs, day.startMs),
      endMs: Math.min(entry.endMs, day.endMs),
    }
    if (clipped.endMs > clipped.startMs) raw.push(clipped)
  }
  const peaks = mergeIntervals(subtractIntervals(raw, cuts))

  const segments = []
  let cursor = day.startMs
  for (const entry of peaks) {
    if (entry.startMs > cursor) segments.push({ startMs: cursor, endMs: entry.startMs, peak: false })
    segments.push({ startMs: entry.startMs, endMs: entry.endMs, peak: true })
    cursor = entry.endMs
  }
  if (cursor < day.endMs) segments.push({ startMs: cursor, endMs: day.endMs, peak: false })
  return { startMs: day.startMs, endMs: day.endMs, segments }
}

/**
 * The phase at `atMs`.
 *
 * @param {number} atMs
 * @param {{ windows: { start: number, end: number }[], weekendsOffPeak?: boolean, holidays?: string[], multiplier?: number }} peak
 * @returns {{ peak: boolean, weekend: boolean, holiday: boolean, startMs: number, endMs: number, untilMs: number, percent: number, multiplier: number }}
 */
export function peakPhase(atMs, peak) {
  const windows = Array.isArray(peak?.windows) ? peak.windows : []
  const multiplier = Number.isFinite(peak?.multiplier) && peak.multiplier > 1 ? peak.multiplier : 1
  const today = beijingDay(atMs)
  const holidays = holidaySet(peak)
  const reason = dayOffReason(atMs, peak, holidays)

  if (reason !== null) {
    const next = occurrencesBetween(today.endMs, today.endMs + SEARCH_DAYS * DAY, windows)
      .find((entry) => dayOffReason(entry.startMs, peak, holidays) === null) ?? null
    return {
      peak: false,
      weekend: reason === 'weekend',
      holiday: reason === 'holiday',
      startMs: today.startMs,
      endMs: today.endMs,
      untilMs: next !== null ? next.startMs : today.endMs,
      percent: clamp01((atMs - today.startMs) / DAY),
      multiplier: 1,
    }
  }

  if (windows.length === 0) {
    const startMs = today.startMs
    return {
      peak: false,
      weekend: false,
      holiday: false,
      startMs,
      endMs: today.endMs,
      untilMs: today.endMs,
      percent: clamp01((atMs - startMs) / DAY),
      multiplier: 1,
    }
  }

  const current = occurrencesBetween(atMs - DAY, atMs + DAY, windows)
    .find((entry) => atMs >= entry.startMs && atMs < entry.endMs)
  if (current !== undefined) {
    return {
      peak: true,
      weekend: false,
      holiday: false,
      startMs: current.startMs,
      endMs: current.endMs,
      untilMs: current.endMs,
      percent: clamp01((atMs - current.startMs) / (current.endMs - current.startMs)),
      multiplier,
    }
  }

  // Look far enough ahead and back to skip a weekend plus a holiday run. A
  // one-day window used to stop at Saturday, so Friday evening promised a peak
  // that never happened and the countdown jumped on Monday.
  const next = occurrencesBetween(atMs, atMs + SEARCH_DAYS * DAY, windows)
    .find((entry) => entry.startMs > atMs && dayOffReason(entry.startMs, peak, holidays) === null) ?? null
  const previousEnd = occurrencesBetween(atMs - SEARCH_DAYS * DAY, atMs, windows)
    .reduce((best, entry) => {
      if (entry.endMs <= atMs && dayOffReason(entry.startMs, peak, holidays) === null && entry.endMs > best) return entry.endMs
      return best
    }, atMs - DAY)
  const endMs = next !== null ? next.startMs : previousEnd + DAY
  return {
    peak: false,
    weekend: false,
    holiday: false,
    startMs: previousEnd,
    endMs,
    untilMs: endMs,
    percent: clamp01((atMs - previousEnd) / Math.max(1, endMs - previousEnd)),
    multiplier: 1,
  }
}
