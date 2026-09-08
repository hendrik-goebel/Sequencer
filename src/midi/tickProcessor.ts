const SCHEDULE_AHEAD_MS = 100

export function createTickProcessor(initialBpm: number, onTick: (scheduledAt: number) => void, subdivision = 1) {
  let beatsPerMinute = initialBpm
  let pendingBeatsPerMinute: number | null = null
  let isPlaying = false
  let fallbackSchedulerTimer: any = null
  let lastTickTimestamp = 0
  let pendingSubdivision: number | null = null

  const getIntervalMs = () => (60000 / (beatsPerMinute * (pendingSubdivision ?? subdivision)))
  const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()

  // Fallback perf-based scheduler (drift-correcting) that gives Web MIDI time
  // to queue each event before its intended output timestamp.
  let nextScheduledTickPerf = 0
  function scheduleLoopFallback() {
    if (!isPlaying) return
    const now = nowMs()
    nextScheduledTickPerf ||= now

    let safety = 0
    while (nextScheduledTickPerf <= now + SCHEDULE_AHEAD_MS && safety < 1000) {
      lastTickTimestamp = nextScheduledTickPerf
      onTick(nextScheduledTickPerf)
      if (pendingBeatsPerMinute != null) { beatsPerMinute = pendingBeatsPerMinute; pendingBeatsPerMinute = null }
      if (pendingSubdivision != null) { subdivision = pendingSubdivision; pendingSubdivision = null }
      nextScheduledTickPerf += getIntervalMs()
      safety++
    }

    const msUntil = Math.max(nextScheduledTickPerf - nowMs() - SCHEDULE_AHEAD_MS - 2, 0)
    clearTimeout(fallbackSchedulerTimer)
    fallbackSchedulerTimer = setTimeout(scheduleLoopFallback, msUntil)
  }

  async function startInternal(delayMs?: number) {
    if (isPlaying) return
    isPlaying = true
    lastTickTimestamp = 0

    nextScheduledTickPerf = nowMs() + (delayMs || 0)
    scheduleLoopFallback()
  }

  function start() { void startInternal() }
  function startAlignedTo(delayMs: number) { void startInternal(delayMs) }

  function stop() {
    if (!isPlaying) return
    isPlaying = false
    clearTimeout(fallbackSchedulerTimer)
    fallbackSchedulerTimer = null
  }

  function setBpm(v: number) {
    if (!isPlaying) { beatsPerMinute = v; return }
    pendingBeatsPerMinute = v
  }

  function setSubdivision(v: number) {
    if (!isPlaying) { subdivision = v; return }
    pendingSubdivision = v
  }

  function timeToNextTick() {
    if (!isPlaying) return 0
    return Math.max(0, (nextScheduledTickPerf || 0) - nowMs())
  }

  function getState() {
    return { bpm: beatsPerMinute, lastTickAt: lastTickTimestamp }
  }

  return { start, startAlignedTo, stop, setBpm, setSubdivision, timeToNextTick, getState }
}
