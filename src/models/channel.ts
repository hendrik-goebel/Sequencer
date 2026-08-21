import { markRaw, reactive, Ref } from 'vue'
import { createArpeggiator, Pattern, StepValue } from './arpeggiator'
import { sendNote } from '../midi/midi'
import { ARRANGEMENT_SLOT_COUNT, DEFAULT_ARPEGGIO_OCTAVE, DEFAULT_NOTES, DEFAULT_STEPS, DEFAULT_BASE, DEFAULT_BPM, DEFAULT_NOTE_LENGTH, DEFAULT_QUANT, CircleOfFifthsKey } from '../config'
import { getToneMaterials } from '../utils/toneMaterial'

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
  randomNoteProbability: number
  randomTimingVariation: number
  randomVelocityVariation: number
  steps: StepValue[]
  velocities: number[]
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
  arrangementReferenceMode: boolean
  arrangementRows: ArrangementSlot[][]
  arrangementRowIndex: number | null
  arrangementIndex: number | null
  arpeggiator: ReturnType<typeof createArpeggiator>
  color: string
  active: boolean
  playStep: number | null
  toneMaterialCursor: number | null
}

export interface StoredArpeggiatorState {
  bpm: number
  tempoOffset: number
  pattern: Pattern
  noteLength: number
  notes: number[]
  additionalNotes?: number[]
  excludedNotes?: number[]
  velocities?: number[]
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
    randomNoteProbability: 0,
    randomTimingVariation: 0,
    randomVelocityVariation: 0,
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
    arrangementReferenceMode: true,
    arrangementRows: Array.from({ length: 1 }, () =>
      Array.from({ length: ARRANGEMENT_SLOT_COUNT }, () => null)
    ) as ArrangementSlot[][],
    arrangementRowIndex: null as number | null,
    arrangementIndex: null as number | null,
    arpeggiator,
    color: '#c94f5e',
    active: false,
    playStep: null as number | null,
    toneMaterialCursor: null as number | null
  }) as Channel

  arpeggiator.on('note', (payload) => {
    channel.active = true
    const materialNotes = getToneMaterials(channel, channel.selectedOctaves)
    const eligibleRandomNotes = materialNotes.filter(candidate => candidate !== payload.note)
    const shouldSubstituteNote = eligibleRandomNotes.length > 0 &&
      Math.random() < channel.randomNoteProbability
    const note = shouldSubstituteNote
      ? eligibleRandomNotes[Math.floor(Math.random() * eligibleRandomNotes.length)]
      : payload.note
    const velocityOffset = Math.round((Math.random() * 2 - 1) * channel.randomVelocityVariation)
    const velocity = Math.max(0, Math.min(127, payload.velocity + velocityOffset))
    const timingOffset = Math.round(Math.random() * channel.randomTimingVariation)
    const { length } = payload

    setTimeout(() => {
      if (!channel.playing) return
      const outputId = selectedOutputId.value
      console.log(`[note-start] ${channel.name} note=${note} velocity=${velocity} length=${length} time=${new Date().toISOString()}`)
      if (!channel.muted && outputId) sendNote(outputId, note, velocity, length, channel.midiChannel - 1)
      log.value.unshift(`${new Date().toISOString()} ${channel.name} NOTE ${note} vel=${velocity} len=${length}`)
    }, timingOffset)

    const timeoutMs = timingOffset + Math.max(length || channel.noteLength || 120, 120)
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
