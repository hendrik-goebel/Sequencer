import { listenToInputMessages } from './midi'

const MIDI_CLOCK = 0xf8
const MIDI_START = 0xfa
const MIDI_CONTINUE = 0xfb
const MIDI_STOP = 0xfc
const CLOCKS_PER_BEAT = 24
const CLOCK_LOOK_AHEAD_MS = 50
const CLOCK_SCHEDULER_INTERVAL_MS = 10

export type MidiClockCallbacks = {
  onTempo?: (bpm: number) => void
  onStart?: () => void
  onStop?: () => void
}

export function createMidiClockOutput(initialBpm: number) {
  let output: WebMidi.MIDIOutput | null = null
  let bpm = initialBpm
  let running = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let nextPulseAt = 0

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedulePulses() {
    if (!running || !output) return
    const interval = 60000 / (bpm * CLOCKS_PER_BEAT)
    const now = performance.now()

    // Do not send a burst of stale ticks after the browser has been paused.
    while (nextPulseAt < now) nextPulseAt += interval

    // MIDIOutput timestamps are handled by the browser's MIDI scheduler, avoiding
    // main-thread timer jitter at the actual output time.
    while (nextPulseAt <= now + CLOCK_LOOK_AHEAD_MS) {
      output.send([MIDI_CLOCK], nextPulseAt)
      nextPulseAt += interval
    }

    timer = setTimeout(schedulePulses, CLOCK_SCHEDULER_INTERVAL_MS)
  }

  function setOutput(nextOutput: WebMidi.MIDIOutput | null) {
    if (output !== nextOutput && running) stop()
    output = nextOutput
  }

  function setBpm(nextBpm: number) {
    if (!Number.isFinite(nextBpm) || nextBpm <= 0) return
    bpm = nextBpm
  }

  function start() {
    if (running || !output) return
    running = true
    output.send([MIDI_START])
    nextPulseAt = performance.now() + 60000 / (bpm * CLOCKS_PER_BEAT)
    schedulePulses()
  }

  function stop() {
    clearTimer()
    if (running && output) output.send([MIDI_STOP])
    running = false
  }

  return { setOutput, setBpm, start, stop }
}

export function createMidiClockInput(callbacks: MidiClockCallbacks = {}) {
  let input: WebMidi.MIDIInput | null = null
  let detachInputListener: (() => void) | null = null
  let lastPulseAt = 0
  let running = false
  let smoothedBpm = 0

  function handleMessage(event: { data: number[], timeStamp: number }) {
    const status = event.data[0]
    const timestamp = event.timeStamp

    if (status === MIDI_CLOCK) {
      if (lastPulseAt > 0) {
        const interval = timestamp - lastPulseAt
        if (interval > 1 && interval < 500) {
          const measuredBpm = 60000 / (interval * CLOCKS_PER_BEAT)
          if (measuredBpm >= 20 && measuredBpm <= 300) {
            smoothedBpm = smoothedBpm === 0 ? measuredBpm : smoothedBpm * 0.8 + measuredBpm * 0.2
            callbacks.onTempo?.(smoothedBpm)
          }
        }
      }
      lastPulseAt = timestamp
      return
    }

    if (status === MIDI_START || status === MIDI_CONTINUE) {
      lastPulseAt = 0
      smoothedBpm = 0
      if (!running) callbacks.onStart?.()
      running = true
    } else if (status === MIDI_STOP) {
      lastPulseAt = 0
      smoothedBpm = 0
      if (running) callbacks.onStop?.()
      running = false
    }
  }

  function setInput(nextInput: WebMidi.MIDIInput | null) {
    detachInputListener?.()
    detachInputListener = null
    input = nextInput
    lastPulseAt = 0
    smoothedBpm = 0
    if (input) detachInputListener = listenToInputMessages(input, handleMessage)
  }

  function dispose() {
    setInput(null)
  }

  return { setInput, dispose }
}
