const SCHEDULE_AHEAD_MS = 100

export function createWorkletClock(initialBpm: number, onTick: (scheduledAt: number) => void, subdivision = 1) {
  let beatsPerMinute = initialBpm
  let pendingBeatsPerMinute: number | null = null
  let audioContext: any = null
  let audioWorkletNode: any = null
  let workletModuleLoaded = false
  let moduleLoadingPromise: Promise<boolean> | null = null
  let lastTickTimestamp = 0

  const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now()

  function performanceTimeForAudioTime(audioTime: number) {
    const outputTimestamp = audioContext?.getOutputTimestamp?.()
    if (outputTimestamp && Number.isFinite(outputTimestamp.contextTime) && Number.isFinite(outputTimestamp.performanceTime)) {
      return outputTimestamp.performanceTime + (audioTime - outputTimestamp.contextTime) * 1000
    }
    return nowMs() + Math.max(0, audioTime - audioContext.currentTime) * 1000
  }

  function tryCreateAudioContext() {
    if (audioContext) return true
    const AudioContext = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext
    if (!AudioContext) return false
    try {
      audioContext = new AudioContext()
      if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') audioContext.resume().catch(() => {})
      return true
    } catch (e) {
      audioContext = null
      return false
    }
  }

  function postToWorklet(message: any) {
    try { audioWorkletNode?.port?.postMessage(message) } catch (e) {}
  }

  async function ensureWorkletModule(): Promise<boolean> {
    if (workletModuleLoaded) return true
    if (moduleLoadingPromise) return moduleLoadingPromise
    if (!tryCreateAudioContext()) return false

    moduleLoadingPromise = (async () => {
      try {
        const moduleUrl = new URL('./midi-clock-processor.js', import.meta.url).toString()
        await audioContext.audioWorklet.addModule(moduleUrl)
        workletModuleLoaded = true
        return true
      } catch (e) {
        workletModuleLoaded = false
        return false
      }
    })()

    return moduleLoadingPromise
  }

  function startWorklet(delayMs?: number) {
    if (!audioContext || !workletModuleLoaded) return false
    if (audioWorkletNode) return true
    try {
      audioWorkletNode = new (globalThis as any).AudioWorkletNode(audioContext, 'midi-clock-processor')
      audioWorkletNode.port.onmessage = (event: any) => {
        if (event?.data?.type === 'tick' && Number.isFinite(event.data.audioTime)) {
          const scheduledAt = performanceTimeForAudioTime(event.data.audioTime)
          lastTickTimestamp = scheduledAt
          onTick(scheduledAt)
        }
      }
      postToWorklet({
        type: 'init',
        sampleRate: audioContext.sampleRate,
        bpm: beatsPerMinute * subdivision,
        scheduleAheadSamples: Math.round(audioContext.sampleRate * SCHEDULE_AHEAD_MS / 1000)
      })
      const startInSamples = (typeof delayMs === 'number') ? Math.max(0, Math.floor((delayMs/1000) * audioContext.sampleRate)) : undefined
      postToWorklet({ type: 'start', bpm: beatsPerMinute * subdivision, startInSamples })
      return true
    } catch (e) {
      audioWorkletNode = null
      return false
    }
  }

  function start() { return startWorklet() }
  function startAlignedTo(delayMs: number) { return startWorklet(delayMs) }

  function stop() {
    if (audioWorkletNode) {
      postToWorklet({ type: 'stop' })
      try { audioWorkletNode.disconnect(); audioWorkletNode = null } catch (e) { audioWorkletNode = null }
    }
  }

  function setBpm(v: number) {
    beatsPerMinute = v
    pendingBeatsPerMinute = v
    postToWorklet({ type: 'setBpm', bpm: v * subdivision })
  }

  function setSubdivision(v: number) {
    subdivision = v
    postToWorklet({ type: 'setBpm', bpm: beatsPerMinute * subdivision })
  }

  function timeToNextTick() {
    if (!audioWorkletNode) return 0
    return Math.max(0, lastTickTimestamp - nowMs())
  }

  function getState() {
    return { bpm: beatsPerMinute, lastTickAt: lastTickTimestamp }
  }

  return { ensureWorkletModule, start, startAlignedTo, stop, setBpm, setSubdivision, timeToNextTick, getState }
}
