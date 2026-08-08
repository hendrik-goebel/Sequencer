import { markRaw, reactive, Ref } from 'vue'
import { createArpeggiator, Pattern, StepValue } from './arpeggiator'
import { sendNote } from '../midi/midi'
import { DEFAULT_ARPEGGIO_OCTAVE, DEFAULT_NOTES, DEFAULT_STEPS, DEFAULT_BASE, DEFAULT_BPM, DEFAULT_NOTE_LENGTH, DEFAULT_QUANT, CircleOfFifthsKey } from '../config'

export type ArrangementSlot = number | null
export type PlaybackMode = 'state' | 'arrangement'

export interface Channel {
  id: number
  name: string
  bpm: number
  tempoOffset: number
  pattern: Pattern | any
  noteLength: number
  playing: boolean
  muted: boolean
  notes: number[]
  additionalNotes: number[]
  excludedNotes: number[]
  reduceNotes: boolean
  steps: StepValue[]
  velocities?: number[]
  base: number
  octave: number
  selectedOctaves: number[]
  loopLength: number
  arpeggioLength: number
  midiChannel: number
  quantisation: number
  key: CircleOfFifthsKey
  microtonesEnabled: boolean
  playbackMode: PlaybackMode
  followArrangementView: boolean
  arrangementSlots: ArrangementSlot[]
  arrangementIndex: number | null
  arpeggiator: ReturnType<typeof createArpeggiator>
  color: string
  active: boolean
  playStep: number | null
}

export interface StoredArpeggiatorState {
  bpm: number
  tempoOffset: number
  pattern: Pattern
  noteLength: number
  notes: number[]
  additionalNotes?: number[]
  excludedNotes?: number[]
  steps: StepValue[]
  base: number
  octave: number
  loopLength: number
  arpeggioLength: number
  quantisation: number
  key: CircleOfFifthsKey
  microtonesEnabled?: boolean
  playbackMode?: PlaybackMode
  followArrangementView?: boolean
}

export function createChannel(index: number, selectedOutputId: Ref<string | null>, log: Ref<string[]>, onLoop?: (channel: Channel) => void) : Channel {
  const arpeggiator = markRaw(createArpeggiator())
  const channel = reactive({
    id: index,
    name: `Ch ${index+1}`,
    bpm: DEFAULT_BPM,
    tempoOffset: 0,
    pattern: 'up' as any,
    noteLength: DEFAULT_NOTE_LENGTH,
    playing: false,
    muted: false,
    notes: DEFAULT_NOTES.slice() as number[],
    additionalNotes: [] as number[],
    excludedNotes: [] as number[],
    reduceNotes: false,
    steps: DEFAULT_STEPS.slice() as StepValue[],
    velocities: Array.from({ length: DEFAULT_STEPS.length }, () => Math.floor(Math.random() * 128)),
    base: DEFAULT_BASE,
    octave: DEFAULT_ARPEGGIO_OCTAVE,
    selectedOctaves: [DEFAULT_ARPEGGIO_OCTAVE],
    loopLength: DEFAULT_STEPS.length,
    arpeggioLength: 4,
    midiChannel: index + 1,
    quantisation: DEFAULT_QUANT,
    key: 'C' as CircleOfFifthsKey,
    microtonesEnabled: false,
    playbackMode: 'state' as PlaybackMode,
    followArrangementView: false,
    arrangementSlots: Array.from({ length: 8 }, () => null) as ArrangementSlot[],
    arrangementIndex: null as number | null,
    arpeggiator,
    color: '#c94f5e',
    active: false,
    playStep: null as number | null
  }) as Channel

  arpeggiator.on('note', (payload) => {
    channel.active = true
    const { note, velocity, length } = payload
    const outputId = selectedOutputId.value
    console.log(`[note-start] ${channel.name} note=${note} velocity=${velocity} length=${length} time=${new Date().toISOString()}`)
    if (!channel.muted && outputId) sendNote(outputId, note, velocity, length, channel.midiChannel - 1)
    log.value.unshift(`${new Date().toISOString()} ${channel.name} NOTE ${note} vel=${velocity} len=${length}`)
    const timeoutMs = Math.max(length || channel.noteLength || 120, 120)
    setTimeout(() => { channel.active = false }, timeoutMs)
  })

  arpeggiator.on('tick', (payload) => {
    const { stepIndex } = payload
    channel.playStep = stepIndex
  })

  arpeggiator.on('loop', () => {
    onLoop?.(channel)
  })

  arpeggiator.on('start', (payload) => {
    const { stepIndex } = payload
    channel.playing = true
    channel.playStep = stepIndex
  })

  arpeggiator.on('stop', () => {
    channel.playing = false
    channel.playStep = null
  })

  arpeggiator.setBpm(channel.bpm)
  arpeggiator.setPattern(channel.pattern)
  arpeggiator.setNoteLength(channel.noteLength)
  arpeggiator.setNotes(channel.notes)
  // ensure arpeggiator knows about the initial loop length before setting steps
  if (typeof arpeggiator.setLoopLength === 'function') arpeggiator.setLoopLength(channel.loopLength)
  arpeggiator.setSteps(channel.steps)
  arpeggiator.setVelocities(channel.velocities)
  // apply initial quantisation to arpeggiator
  if (typeof arpeggiator.setSubdivision === 'function') arpeggiator.setSubdivision(channel.quantisation)
  return channel
}
