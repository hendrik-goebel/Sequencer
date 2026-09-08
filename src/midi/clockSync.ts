import { listenToInputMessages } from './midi'

const MIDI_CLOCK = 0xf8
const MIDI_START = 0xfa
const MIDI_CONTINUE = 0xfb
const MIDI_STOP = 0xfc
const CLOCKS_PER_BEAT = 24
const CLOCK_LOOK_AHEAD_MS = 250
const CLOCK_SCHEDULER_INTERVAL_MS = 25
const CLOCK_START_DELAY_MS = 10
const BROADCAST_CHANNEL_NAME = 'arpeggiator-midi-clock-v1'

export const BROADCAST_CLOCK_ID = '__broadcast_clock__'
export const BROADCAST_CLOCK_NAME = 'BroadcastChannel (other tab)'

type ClockOutputTarget = WebMidi.MIDIOutput | 'broadcast' | null
type ClockInputTarget = WebMidi.MIDIInput | 'broadcast' | null
type BroadcastClockMessage = {
  type: 'midi-clock'
  status: number
}

export type MidiClockCallbacks = {
  onTempo?: (bpm: number) => void
  onStart?: () => void
  onStop?: () => void
}

export function isBroadcastClockAvailable() {
  return typeof BroadcastChannel !== 'undefined'
}

function isRealtimeClockStatus(status: unknown): status is number {
  return status === MIDI_CLOCK ||
    status === MIDI_START ||
    status === MIDI_CONTINUE ||
    status === MIDI_STOP
}

function isBroadcastClockMessage(value: unknown): value is BroadcastClockMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<BroadcastClockMessage>
  return message.type === 'midi-clock' && isRealtimeClockStatus(message.status)
}

export function createMidiClockOutput(initialBpm: number) {
  let output: WebMidi.MIDIOutput | null = null
  let broadcastChannel: BroadcastChannel | null = null
  let bpm = initialBpm
  let running = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let nextPulseAt = 0

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function clearScheduledEvents() {
    output?.clear()
  }

  function send(status: number, timestamp?: number) {
    if (output) {
      output.send([status], timestamp)
      return
    }
    broadcastChannel?.postMessage({ type: 'midi-clock', status } satisfies BroadcastClockMessage)
  }

  function schedulePulses() {
    if (!running || (!output && !broadcastChannel)) return
    const interval = 60000 / (bpm * CLOCKS_PER_BEAT)
    const now = performance.now()

    // Do not send a burst of stale ticks after the browser has been paused.
    while (nextPulseAt < now) nextPulseAt += interval

    if (broadcastChannel) {
      timer = setTimeout(() => {
        send(MIDI_CLOCK)
        nextPulseAt += interval
        schedulePulses()
      }, Math.max(0, nextPulseAt - now))
      return
    }

    // MIDIOutput timestamps are handled by the browser's MIDI scheduler, avoiding
    // main-thread timer jitter at the actual output time.
    while (nextPulseAt <= now + CLOCK_LOOK_AHEAD_MS) {
      send(MIDI_CLOCK, nextPulseAt)
      nextPulseAt += interval
    }

    timer = setTimeout(schedulePulses, CLOCK_SCHEDULER_INTERVAL_MS)
  }

  function setOutput(nextOutput: ClockOutputTarget) {
    const nextIsBroadcast = nextOutput === 'broadcast'
    const outputChanged = output !== (nextIsBroadcast ? null : nextOutput)
    const broadcastChanged = Boolean(broadcastChannel) !== nextIsBroadcast
    if ((outputChanged || broadcastChanged) && running) stop()
    broadcastChannel?.close()
    broadcastChannel = nextIsBroadcast && isBroadcastClockAvailable()
      ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      : null
    output = nextIsBroadcast ? null : nextOutput
  }

  function setBpm(nextBpm: number) {
    if (!Number.isFinite(nextBpm) || nextBpm <= 0) return
    bpm = nextBpm
    if (!running) return

    clearTimer()
    clearScheduledEvents()
    nextPulseAt = performance.now() + 60000 / (bpm * CLOCKS_PER_BEAT)
    schedulePulses()
  }

  function start() {
    if (running || (!output && !broadcastChannel)) return
    running = true
    const startAt = performance.now() + CLOCK_START_DELAY_MS
    send(MIDI_START, startAt)
    nextPulseAt = startAt
    schedulePulses()
  }

  function stop() {
    clearTimer()
    clearScheduledEvents()
    if (running) send(MIDI_STOP)
    running = false
  }

  return { setOutput, setBpm, start, stop }
}

export function createMidiClockInput(callbacks: MidiClockCallbacks = {}) {
  let input: WebMidi.MIDIInput | null = null
  let broadcastChannel: BroadcastChannel | null = null
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

  function setInput(nextInput: ClockInputTarget) {
    detachInputListener?.()
    detachInputListener = null
    broadcastChannel?.close()
    broadcastChannel = null
    input = nextInput === 'broadcast' ? null : nextInput
    lastPulseAt = 0
    smoothedBpm = 0
    if (input) detachInputListener = listenToInputMessages(input, handleMessage)
    if (nextInput === 'broadcast' && isBroadcastClockAvailable()) {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      broadcastChannel.onmessage = (event: MessageEvent<unknown>) => {
        if (!isBroadcastClockMessage(event.data)) return
        handleMessage({ data: [event.data.status], timeStamp: performance.now() })
      }
    }
  }

  function dispose() {
    setInput(null)
  }

  return { setInput, dispose }
}
