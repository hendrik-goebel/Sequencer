import { DEFAULT_BPM, DEFAULT_NOTE_LENGTH, STEP_COUNT, DEFAULT_QUANT, noteLengthToMilliseconds } from '../config'
import { createMidiClock } from './midiClock'
import { MIDI } from '../midi/constants'
import { createEventEmitter } from '../utils/eventEmitter'

export type Pattern = 'up'|'down'|'updown'|'random'
export type SustainedStep = { notes: number | number[], duration: number }
export type StepValue = number | number[] | SustainedStep

export function isSustainedStep(value: StepValue | undefined): value is SustainedStep {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'notes' in value && 'duration' in value
}

export function stepNotes(value: StepValue | undefined): number[] {
  if (typeof value === 'number') return value >= 0 ? [value] : []
  if (Array.isArray(value)) return value
  return isSustainedStep(value)
    ? (Array.isArray(value.notes) ? value.notes : [value.notes])
    : []
}

export type ArpeggiatorEvents = {
  tick: { stepIndex: number, noteIndex: number, pattern: Pattern }
  note: { note: number, velocity: number, length: number }
  start: { stepIndex: number }
  stop: void
}

export function createArpeggiator() {
  const events = createEventEmitter<ArpeggiatorEvents>()

  let notes: number[] = []
  let pattern: Pattern = 'up'
  let noteLength = DEFAULT_NOTE_LENGTH
  let noteIndex = 0
  let stepPointer = 0
  let scanDirection = 1
  let steps: StepValue[] = [] // MIDI note numbers, chords, or -1 for rest
  let velocities: number[] = []
  let loopLength = STEP_COUNT
  let clock: any = null
  let isPlaying = false
  // The UI quantisation is a note denominator: 4 is a quarter note.
  let subdivision = DEFAULT_QUANT / 4
  let bpm = DEFAULT_BPM

  const safeModulo = (n:number, m:number) => ((n % m) + m) % m

  function advanceIndexForPattern() {
    if (!notes.length) return
    if (pattern === 'random') {
      noteIndex = Math.floor(Math.random() * notes.length)
    } else if (pattern === 'up') {
      noteIndex = safeModulo(noteIndex + 1, notes.length)
    } else if (pattern === 'down') {
      noteIndex = safeModulo(noteIndex - 1, notes.length)
    } else if (pattern === 'updown') {
      if (notes.length <= 1) { noteIndex = 0; return }
      if (scanDirection === 1 && noteIndex >= notes.length - 1) scanDirection = -1
      else if (scanDirection === -1 && noteIndex <= 0) scanDirection = 1
      noteIndex = Math.max(0, Math.min(notes.length - 1, noteIndex + scanDirection))
    }
  }

  function getNoteLengthMilliseconds() {
    return noteLengthToMilliseconds(noteLength, bpm)
  }

  function ensureClock() {
    clock = createMidiClock(bpm, tick, subdivision)
    if (isPlaying && clock && typeof clock.start === 'function') clock.start()
  }

  function setLoopLength(n:number){
    loopLength = Math.max(1, Math.min(64, Math.floor(n)))
    // resize steps array to match loopLength
    if (!steps) steps = []
    if (steps.length < loopLength) {
      steps = steps.concat(Array.from({ length: loopLength - steps.length }, () => -1))
    } else if (steps.length > loopLength) {
      steps = steps.slice(0, loopLength)
    }
    stepPointer = stepPointer % Math.max(1, loopLength)
  }

  function tick() {
    if (!steps || steps.length === 0) { stepPointer = (stepPointer + 1) % Math.max(1, loopLength); advanceIndexForPattern(); return }

    const stepCount = Math.max(1, steps.length)
    const currentStep = stepPointer % stepCount
    const stepValue = steps[currentStep]

    events.emit('tick', { stepIndex: currentStep, noteIndex: noteIndex, pattern })

    const notesForStep = stepNotes(stepValue)
    const duration = isSustainedStep(stepValue) ? Math.max(1, stepValue.duration) : 1
    if (notesForStep.length) {
      notesForStep.forEach((note) => {
        events.emit('note', { note, velocity: velocities[currentStep] ?? MIDI.VELOCITY_MAX, length: getNoteLengthMilliseconds() * duration })
      })
    }

    // advance pointers
    stepPointer = (stepPointer + 1) % Math.max(1, loopLength)

    // also advance pattern index for pattern-based arpeggios (keeps legacy behavior usable)
    advanceIndexForPattern()
  }

  // initialize clock
  ensureClock()

  function start(){
    if (!notes.length) return
    stepPointer = 0
    noteIndex = (pattern === 'random' && notes.length) ? Math.floor(Math.random() * notes.length) : 0
    isPlaying = true
    events.emit('start', { stepIndex: stepPointer })
    if (clock && typeof clock.start === 'function') {
      clock.start()
    }
  }

  function startAlignedTo(other:any){
    if (!notes.length) return

    if (other && typeof other.getState === 'function') {
      const s = other.getState()
      noteIndex = s.index ?? noteIndex
      stepPointer = s.stepIndex ?? stepPointer
      scanDirection = s.direction ?? scanDirection
      pattern = s.pattern ?? pattern
    }

    const delay = (other && typeof other.timeToNextTick === 'function') ? other.timeToNextTick() : 0
    isPlaying = true
    events.emit('start', { stepIndex: stepPointer })
    if (clock && typeof clock.startAlignedTo === 'function') clock.startAlignedTo(delay)
    if (clock && typeof clock.start === 'function' && delay === 0) clock.start()
  }

  function timeToNextTick(){ return clock ? clock.timeToNextTick() : 0 }

  function getState(){ return { index: noteIndex, stepIndex: stepPointer, direction: scanDirection, pattern } }

  function stop(){
    if (clock && typeof clock.stop === 'function') {
      clock.stop()
      isPlaying = false
      events.emit('stop', undefined as void)
    }
  }

  function setBpm(v:number){
    bpm = v
    if (clock && typeof clock.setBpm === 'function') clock.setBpm(v)
  }
  function setPattern(p:Pattern){ pattern = p }
  function setNotes(n:number[]){
    const currentNote = notes[noteIndex]
    notes = n

    if (!notes.length) {
      noteIndex = 0
      scanDirection = 1
      return
    }

    const currentNoteIndex = currentNote === undefined ? -1 : notes.indexOf(currentNote)
    noteIndex = currentNoteIndex >= 0
      ? currentNoteIndex
      : Math.min(noteIndex, notes.length - 1)
  }
  function setNoteLength(ms:number){ noteLength = ms }
  function setSteps(s: StepValue[]){
    steps = s
    stepPointer = stepPointer % Math.max(1, steps.length || loopLength)
  }
  function setVelocities(v: number[]){ velocities = v }
  function setSubdivision(n:number){
    const quantisation = Math.max(1, Math.min(64, Math.floor(n)))
    subdivision = quantisation / 4
    if (clock && typeof clock.setSubdivision === 'function') clock.setSubdivision(subdivision)
  }

  function on<EventName extends keyof ArpeggiatorEvents>(
    eventName: EventName,
    handler: (payload: ArpeggiatorEvents[EventName]) => void
  ) {
    return events.on(eventName, handler)
  }

  function off<EventName extends keyof ArpeggiatorEvents>(
    eventName: EventName,
    handler: (payload: ArpeggiatorEvents[EventName]) => void
  ) {
    return events.off(eventName, handler)
  }

  return { start, startAlignedTo, stop, setBpm, setPattern, setNotes, setNoteLength, setSteps, setVelocities, getState, timeToNextTick, setLoopLength, setSubdivision, on, off }
}
