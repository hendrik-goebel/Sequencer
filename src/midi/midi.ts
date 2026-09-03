import { MIDI, noteOffStatus, noteOnStatus } from './constants'

let midiAccess: WebMidi.MIDIAccess | null = null
let selectedOutput: WebMidi.MIDIOutput | null = null

export const SINE_OUTPUT_ID = '__sine__'
const VIRTUAL_OUTPUTS = [{ id: SINE_OUTPUT_ID, name: 'Sine Synth (internal)' }]
let sineSynthEnabled = false
let audioContext: AudioContext | null = null

export interface MidiInputMessage {
  data: number[]
  timeStamp: number
  inputId: string
  inputName: string
  event: any
}

export type MidiInputListener = (message: MidiInputMessage) => void

type InputListenerState = {
  input: WebMidi.MIDIInput
  listeners: Set<MidiInputListener>
  onMessage: (event: any) => void
}

const inputListenerStates = new Map<string, InputListenerState>()

function clampMidiValue(value: number) {
  const n = Math.round(Number(value) || 0)
  return Math.max(0, Math.min(127, n))
}

function clampMidiByte(value: number) {
  const n = Math.round(Number(value) || 0)
  return Math.max(0, Math.min(255, n))
}

function toMidiData(data: any): number[] {
  if (!data) return []
  if (Array.isArray(data)) return data.map(value => clampMidiByte(value))
  if (typeof data.length === 'number') {
    return Array.from(data as ArrayLike<number>).map(value => clampMidiByte(value))
  }
  return []
}

function ensureInputListenerState(input: WebMidi.MIDIInput) {
  const existing = inputListenerStates.get(input.id)
  if (existing) return existing

  const state: InputListenerState = {
    input,
    listeners: new Set<MidiInputListener>(),
    onMessage: (event: any) => {
      const listeners = inputListenerStates.get(input.id)?.listeners
      if (!listeners?.size) return
      const message: MidiInputMessage = {
        data: toMidiData(event?.data),
        timeStamp: Number.isFinite(event?.timeStamp) ? Number(event.timeStamp) : performance.now(),
        inputId: input.id,
        inputName: input.name || input.manufacturer || input.id,
        event
      }
      listeners.forEach(listener => listener(message))
    }
  }
  inputListenerStates.set(input.id, state)
  return state
}

export function listenToInputMessages(input: WebMidi.MIDIInput | null, listener: MidiInputListener) {
  if (!input) return () => {}

  const state = ensureInputListenerState(input)
  state.listeners.add(listener)
  state.input.onmidimessage = state.onMessage

  return () => {
    const latestState = inputListenerStates.get(input.id)
    if (!latestState) return
    latestState.listeners.delete(listener)
    if (!latestState.listeners.size) {
      if (latestState.input.onmidimessage === latestState.onMessage) {
        latestState.input.onmidimessage = null
      }
      inputListenerStates.delete(input.id)
    }
  }
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioContext
}

export async function initMidi() {
  if (navigator && (navigator as any).requestMIDIAccess) {
    midiAccess = await (navigator as any).requestMIDIAccess()
    return midiAccess
  }
  throw new Error('Web MIDI API not supported')
}

export function enableSineSynth() {
  sineSynthEnabled = true
  ensureAudio()
}
export function disableSineSynth() { sineSynthEnabled = false }

export function listOutputs() {
  const outs: {id:string,name:string}[] = []
  if (midiAccess) {
    midiAccess.outputs.forEach((o:any)=> outs.push({id: o.id, name: o.name || o.manufacturer || o.id}))
  }
  outs.push(...VIRTUAL_OUTPUTS)
  return outs
}

export function listInputs() {
  const inputs: {id:string,name:string}[] = []
  if (midiAccess) {
    midiAccess.inputs.forEach((input:any) => inputs.push({
      id: input.id,
      name: input.name || input.manufacturer || input.id
    }))
  }
  return inputs
}

export function getOutput(id: string | null) {
  if (!midiAccess || !id || id === SINE_OUTPUT_ID) return null
  return midiAccess.outputs.get(id) ?? null
}

export function getInput(id: string | null) {
  if (!midiAccess || !id) return null
  return midiAccess.inputs.get(id) ?? null
}

export function selectOutput(id:string) {
  if (id === SINE_OUTPUT_ID) {
    selectedOutput = null
    return null
  }
  if (!midiAccess) return null
  const out = midiAccess.outputs.get(id)
  selectedOutput = out ?? null
  return selectedOutput
}

export function sendNote(outputId:string, note:number, velocity:number, lengthMs:number, channel = 0) {
  if (outputId === VIRTUAL_OUTPUTS[0].id && sineSynthEnabled) {
    playSine(note, velocity, lengthMs)
    return
  }

  if (!midiAccess) return
  const out = midiAccess.outputs.get(outputId)
  if (!out) return
  const safeNote = clampMidiValue(note)
  const safeVelocity = clampMidiValue(velocity)
  const safeChannel = Math.max(0, Math.min(15, Math.floor(channel)))
  console.log(`[midi-note-on] output=${outputId} channel=${safeChannel + 1} note=${safeNote} velocity=${safeVelocity} time=${new Date().toISOString()}`)
  out.send([noteOnStatus(safeChannel), safeNote, safeVelocity])
  setTimeout(()=> out.send([noteOffStatus(safeChannel), safeNote, MIDI.DEFAULT_OFF_VELOCITY]), lengthMs)
}

function playSine(note:number, velocity:number, lengthMs:number) {
  const ctx = ensureAudio()
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const freq = 440 * Math.pow(2, (note - 69) / 12)
  osc.type = 'sine'
  try { osc.frequency.value = freq } catch (e) {}
  const vel = Math.max(0, Math.min(127, Math.floor(Number(velocity) || 0)))
  const amp = (vel / 127) * 0.2
  gain.gain.setValueAtTime(amp, now)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  const stopTime = now + Math.max(0.02, lengthMs / 1000)
  gain.gain.linearRampToValueAtTime(0.0001, stopTime)
  osc.stop(stopTime + 0.02)
  setTimeout(() => {
    try { osc.disconnect(); gain.disconnect() } catch (e) {}
  }, lengthMs + 200)
  console.log(`[sine-note] note=${note} freq=${freq.toFixed(2)} vel=${velocity} len=${lengthMs} time=${new Date().toISOString()}`)
}

export function sendRaw(note:number, velocity:number, lengthMs:number, channel = 0) {
  if (!selectedOutput) return
  const safeNote = clampMidiValue(note)
  const safeVelocity = clampMidiValue(velocity)
  const safeChannel = Math.max(0, Math.min(15, Math.floor(channel)))
  console.log(`[midi-note-on] output=${selectedOutput.id} channel=${safeChannel + 1} note=${safeNote} velocity=${safeVelocity} time=${new Date().toISOString()}`)
  selectedOutput.send([noteOnStatus(safeChannel), safeNote, safeVelocity])
  setTimeout(()=> selectedOutput && selectedOutput.send([noteOffStatus(safeChannel), safeNote, MIDI.DEFAULT_OFF_VELOCITY]), lengthMs)
}
