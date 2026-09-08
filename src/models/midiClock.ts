import { createTickProcessor } from '../midi/tickProcessor'
import { createWorkletClock } from '../midi/workletClock'

export function createMidiClock(initialBpm: number, onTick: (scheduledAt: number) => void, subdivision = 1) {
  // Create both implementations and prefer worklet when available
  const fallback = createTickProcessor(initialBpm, onTick, subdivision)
  const worklet = createWorkletClock(initialBpm, onTick, subdivision)

  let isUsingWorklet = false
  let isPlaying = false

  async function startInternal(delayMs?: number) {
    if (isPlaying) return
    isPlaying = true

    // Try to initialize worklet module
    const workletReady = await worklet.ensureWorkletModule()
    if (workletReady) {
      if (delayMs && delayMs > 0) worklet.startAlignedTo(delayMs)
      else worklet.start()
      isUsingWorklet = true
      // stop fallback if it started for some reason
      try { fallback.stop() } catch (e) {}
      return
    }

    // fallback
    if (typeof (fallback as any).startAlignedTo === 'function') {
      try { (fallback as any).startAlignedTo(delayMs || 0) } catch (e) {}
    } else if (typeof (fallback as any).start === 'function') {
      // best-effort: start immediately or after delay if provided
      if (delayMs && delayMs > 0) {
        setTimeout(() => { try { (fallback as any).start() } catch (e) {} }, delayMs)
      } else {
        try { (fallback as any).start() } catch (e) {}
      }
    }
    // if module loads later, switch over using async/await
    (async () => {
      try {
        const ready = await worklet.ensureWorkletModule()
        if (!isPlaying || !ready) return
        try { fallback.stop() } catch (e) {}
        if (typeof (worklet as any).startAlignedTo === 'function') {
          try { (worklet as any).startAlignedTo(delayMs || 0) } catch (e) {}
        } else if (typeof (worklet as any).start === 'function') {
          try { (worklet as any).start() } catch (e) {}
        }
        isUsingWorklet = true
      } catch (e) {}
    })()
  }

  function start() { void startInternal() }
  function startAlignedTo(delayMs: number) { void startInternal(delayMs) }

  function stop() {
    if (!isPlaying) return
    isPlaying = false
    try { fallback.stop() } catch (e) {}
    try { worklet.stop() } catch (e) {}
    isUsingWorklet = false
  }

  function setBpm(v: number) {
    // update both implementations so they stay in sync when switching
    try { fallback.setBpm(v) } catch (e) {}
    try { worklet.setBpm(v) } catch (e) {}
  }

  function setSubdivision(v: number) {
    try { fallback.setSubdivision(v) } catch (e) {}
    try { worklet.setSubdivision(v) } catch (e) {}
  }

  function timeToNextTick() {
    try {
      if (isUsingWorklet) return worklet.timeToNextTick()
    return fallback.timeToNextTick()
  } catch (e) { return 0 }
  }

  function getState() {
    try { return isUsingWorklet ? worklet.getState() : fallback.getState() } catch (e) { return { bpm: initialBpm, lastTickAt: 0 } }
  }

  return { start, startAlignedTo, stop, setBpm, setSubdivision, timeToNextTick, getState }
}
