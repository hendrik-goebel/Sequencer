import { ref, computed, watch } from 'vue'
import { initMidi, listOutputs, listInputs, getOutput, getInput, selectOutput, sendNote, enableSineSynth, disableSineSynth, SINE_OUTPUT_ID } from './midi/midi'
import { createMidiClockInput, createMidiClockOutput } from './midi/clockSync'
import { Channel, createChannel, PlaybackMode, StoredArpeggiatorState } from './models/channel'
import { isSustainedStep, Pattern, stepNotes, StepValue } from './models/arpeggiator'
import { ARPEGGIO_OCTAVES, ARRANGEMENT_ROW_COUNT, ARRANGEMENT_SLOT_COUNT, CHANNEL_COUNT, DEFAULT_BPM, KEYBOARD_NOTE_OFFSETS, MAJOR_SCALE_OFFSETS, MICROTONAL_STEP, KEYS, NO_KEY, STEP_COUNT, MAX_LOOP_LENGTH, NOTE_LENGTH_OPTIONS, CircleOfFifthsKey, noteLengthToMilliseconds, STORED_STATE_COUNT } from './config'
import { MIDI } from './midi/constants'
import { getToneMaterials } from './utils/toneMaterial'

const SEED_PREFIX = 'ARP1-'
const ADDITIONAL_VARIATION_CHANGE_CHANCE = 0.35

interface SeedChannelState extends StoredArpeggiatorState {
  midiChannel: number
  muted: boolean
  playbackMode?: PlaybackMode
  followArrangementView?: boolean
  arrangementSlots?: (number | null)[]
  arrangementRows?: (number | null)[][]
  arrangementRowIndex?: number | null
  arrangementIndex?: number | null
}

interface AppSeed {
  version: 1
  globalBpm: number
  globalKey: CircleOfFifthsKey
  currentIndex: number
  channels: SeedChannelState[]
  storedStates: (StoredArpeggiatorState | null)[][]
  activeStoredStateIndexes: (number | null)[]
}

export function useChannels() {
  const log = ref<string[]>([])
  const outputs = ref<{id:string,name:string}[]>([])
  const selectedOutputId = ref<string | null>(null)
  function createArrangementSlots(source?: (number | null)[]) {
    return Array.from({ length: ARRANGEMENT_SLOT_COUNT }, (_, index) => {
      const value = source?.[index]
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < STORED_STATE_COUNT ? value : null
    })
  }
  function createArrangementRows(source?: (number | null)[][], legacySlots?: (number | null)[]) {
    const rowCount = source
      ? Math.max(1, Math.min(ARRANGEMENT_ROW_COUNT, source.length))
      : 1
    return Array.from({ length: rowCount }, (_, rowIndex) =>
      createArrangementSlots(source?.[rowIndex] ?? (rowIndex === 0 ? legacySlots : undefined))
    )
  }

  const channels = Array.from({length: CHANNEL_COUNT}, (_, index)=> createChannel(index, selectedOutputId, log, handleChannelLoop))
  const currentIndex = ref(0)
  const currentChannel = computed(() => channels[currentIndex.value])
  const allMuted = computed(() => channels.every(channel => channel.muted))
  const storedStates = ref<(StoredArpeggiatorState | null)[][]>(
    channels.map(() => Array.from({ length: STORED_STATE_COUNT }, () => null))
  )
  const currentStoredStates = computed(() => storedStates.value[currentIndex.value])
  const activeStoredStateIndexes = ref<(number | null)[]>(channels.map(() => 0))
  const currentActiveStoredStateIndex = computed(() => activeStoredStateIndexes.value[currentIndex.value])
  const activeArrangementStateIndexes = ref<(number | null)[]>(channels.map(() => null))
  const currentActiveArrangementStateIndex = computed(() => activeArrangementStateIndexes.value[currentIndex.value])

  const globalBpm = ref(DEFAULT_BPM)
  const globalKey = ref<CircleOfFifthsKey>('C')
  const globalPlaying = ref(false)
  const clockOutputs = ref<{id:string,name:string}[]>([])
  const clockInputs = ref<{id:string,name:string}[]>([])
  const clockOutputId = ref<string | null>(null)
  const clockInputId = ref<string | null>(null)
  const midiClockOutputEnabled = ref(false)
  const midiClockInputEnabled = ref(false)
  const midiClockOutput = createMidiClockOutput(globalBpm.value)
  const midiClockInput = createMidiClockInput({
    onTempo: (bpm) => setGlobalBpm(Math.round(bpm * 10) / 10),
    onStart: () => { if (!globalPlaying.value) toggleGlobalPlay() },
    onStop: () => { if (globalPlaying.value) stopAll() }
  })

  function isValidStoredStateIndex(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < STORED_STATE_COUNT
  }

  function isPlaybackMode(value: unknown): value is PlaybackMode {
    return value === 'state' || value === 'arrangement'
  }

  function findArrangementSlot(channel: Channel, rowIndex: number, fromIndex: number | null) {
    const slots = channel.arrangementRows[rowIndex]
    if (!slots.length) return null
    const start = fromIndex === null ? -1 : fromIndex
    for (let offset = 1; offset <= slots.length; offset++) {
      const slotIndex = (start + offset) % slots.length
      const storedStateIndex = slots[slotIndex]
      if (!isValidStoredStateIndex(storedStateIndex)) continue
      if (storedStates.value[channel.id][storedStateIndex]) return slotIndex
    }
    return null
  }

  function applyArrangementSlot(channel: Channel, rowIndex: number, slotIndex: number | null) {
    if (slotIndex === null) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }

    const storedStateIndex = channel.arrangementRows[rowIndex][slotIndex]
    if (!isValidStoredStateIndex(storedStateIndex)) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }

    const state = storedStates.value[channel.id][storedStateIndex]
    if (!state) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }

    channel.arrangementIndex = slotIndex
    channel.arrangementRowIndex = rowIndex
    activeArrangementStateIndexes.value[channel.id] = storedStateIndex
    applyChannelState(channel, state, { applyPlaybackMode: false })
  }

  function primeArrangement(channel: Channel) {
    if (channel.arrangementRowIndex === null) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }
    const firstSlot = findArrangementSlot(channel, channel.arrangementRowIndex, null)
    if (firstSlot !== null) applyArrangementSlot(channel, channel.arrangementRowIndex, firstSlot)
    else channel.arrangementIndex = null
  }

  function advanceArrangement(channel: Channel) {
    if (channel.arrangementRowIndex === null) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }
    const nextSlot = findArrangementSlot(channel, channel.arrangementRowIndex, channel.arrangementIndex)
    if (nextSlot === null) {
      channel.arrangementIndex = null
      return
    }
    applyArrangementSlot(channel, channel.arrangementRowIndex, nextSlot)
  }

  function normalizeArrangement(channel: Channel) {
    if (channel.arrangementRowIndex === null) {
      channel.arrangementIndex = null
      activeArrangementStateIndexes.value[channel.id] = null
      return
    }
    if (channel.arrangementIndex === null) {
      channel.arrangementIndex = findArrangementSlot(channel, channel.arrangementRowIndex, null)
      return
    }
    const currentStoredStateIndex = channel.arrangementRows[channel.arrangementRowIndex][channel.arrangementIndex]
    if (!isValidStoredStateIndex(currentStoredStateIndex)) {
      const nextSlot = findArrangementSlot(channel, channel.arrangementRowIndex, channel.arrangementIndex)
      channel.arrangementIndex = nextSlot
    }
  }

  function handleChannelLoop(channel: Channel) {
    if (channel.playbackMode !== 'arrangement') return
    advanceArrangement(channel)
  }

  function startChannelPlayback(channel: Channel, referenceChannel?: Channel) {
    if (channel.playbackMode === 'arrangement') {
      primeArrangement(channel)
    }
    if (referenceChannel && typeof channel.arpeggiator.startAlignedTo === 'function') {
      channel.arpeggiator.startAlignedTo(referenceChannel.arpeggiator)
    } else {
      channel.arpeggiator.start()
    }
  }

  function getKeyPitchClass(channel: typeof channels[number]) {
    return KEYS.find(key => key.name === channel.key)?.pitchClass ?? null
  }

  function isKeyTone(channel: typeof channels[number], note: number) {
    const keyPitchClass = getKeyPitchClass(channel)
    if (keyPitchClass === null || channel.key === NO_KEY) return false
    const keyPitchClasses = MAJOR_SCALE_OFFSETS.map(offset => (keyPitchClass + offset) % 12)
    return Number.isInteger(note) && keyPitchClasses.includes((note % 12 + 12) % 12)
  }

  function setGlobalBpm(bpm:number){
    globalBpm.value = bpm
    channels.forEach(channel => {
      channel.bpm = bpm + channel.tempoOffset
      channel.arpeggiator.setBpm(channel.bpm)
    })
    midiClockOutput.setBpm(bpm)
  }

  function updateGlobalKey(key: string) {
    if (key !== NO_KEY && !KEYS.some(candidate => candidate.name === key)) return
    globalKey.value = key as CircleOfFifthsKey
    channels.forEach(channel => {
      channel.key = globalKey.value
      if (globalKey.value === NO_KEY) channel.additionalNotes = []
    })
  }

  function syncMidiClockTransport() {
    if (!midiClockOutputEnabled.value) return
    if (channels.some(channel => channel.playing)) midiClockOutput.start()
    else midiClockOutput.stop()
  }

  function toggleGlobalPlay(){
    if (globalPlaying.value) {
      // stop all channels
      channels.forEach(channel => { if (channel.playing) channel.arpeggiator.stop() })
      globalPlaying.value = false
      midiClockOutput.stop()
    } else {
      // start all channels
      channels.forEach(channel => {
        if (!channel.playing) startChannelPlayback(channel)
      })
      globalPlaying.value = true
      syncMidiClockTransport()
    }
  }

  function stopAll() {
    channels.forEach(channel => channel.arpeggiator.stop())
    globalPlaying.value = false
    midiClockOutput.stop()
  }

  function selectChannel(index:number){ currentIndex.value = index }
  function toggleChannelPlay(index:number){
    const channel = channels[index]
    if (channel.playing) {
      channel.arpeggiator.stop()
    } else {
      // if any other channel is playing, align this channel's first note to them
      const referenceChannel = channels.find(c => c.playing && c !== channel)
      startChannelPlayback(channel, referenceChannel)
    }
    syncMidiClockTransport()
  }

  function toggleMute(index: number) {
    const channel = channels[index]
    if (channel) channel.muted = !channel.muted
  }

  function toggleMuteAll() {
    const muted = !allMuted.value
    channels.forEach(channel => { channel.muted = muted })
  }

  function togglePlay(){
    const channel = currentChannel.value
    if (channel.playing) { channel.arpeggiator.stop() }
    else {
      const referenceChannel = channels.find(c => c.playing && c !== channel)
      startChannelPlayback(channel, referenceChannel)
      syncMidiClockTransport()
    }
  }

  function toggleToneMaterial(note: number) {
    const channel = currentChannel.value
    const isKeyNote = isKeyTone(channel, note)
    channel.toneMaterialCursor = note
    const activeOctaves = channel.selectedOctaves.length
      ? channel.selectedOctaves
      : [channel.octave]
    const pitchOffset = (note % 12 + 12) % 12
    const octaveNotes = activeOctaves.map(octave => 12 * (octave + 1) + pitchOffset)
    const isExcluded = channel.excludedNotes.includes(note)
    const isAdditional = channel.additionalNotes.includes(note)

    if (isExcluded) {
      channel.excludedNotes = channel.excludedNotes.filter(candidate => !octaveNotes.includes(candidate))
    } else if (isKeyNote) {
      channel.excludedNotes = [...new Set([...channel.excludedNotes, ...octaveNotes])].sort((a, b) => a - b)
    } else if (isAdditional) {
      channel.additionalNotes = channel.additionalNotes.filter(candidate => !octaveNotes.includes(candidate))
    } else {
      channel.additionalNotes = [...new Set([...channel.additionalNotes, ...octaveNotes])].sort((a, b) => a - b)
    }
  }

  function shiftCurrentToneMaterial(direction: 1 | -1) {
    const channel = currentChannel.value
    const keyPitchClass = getKeyPitchClass(channel)
    if (keyPitchClass === null || channel.key === NO_KEY) return

    const activeOctaves = channel.selectedOctaves.length
      ? channel.selectedOctaves
      : [channel.octave]
    const keyNotes = activeOctaves
      .flatMap(octave => MAJOR_SCALE_OFFSETS.map(offset =>
        12 * (octave + 1) + ((keyPitchClass + offset) % 12)))
      .sort((a, b) => a - b)
    const isInActiveOctave = (note: number) =>
      activeOctaves.includes(Math.floor(note / 12) - 1)
    const activeNotes = [...new Set(getToneMaterials(channel, activeOctaves))]
      .filter(isInActiveOctave)
    const shiftedNotes = activeNotes.map(note => {
      const nextNote = direction > 0
        ? keyNotes.find(candidate => candidate > note)
        : [...keyNotes].reverse().find(candidate => candidate < note)
      return nextNote ?? (direction > 0 ? keyNotes[0] : keyNotes[keyNotes.length - 1])
    })

    activeNotes.forEach(note => toggleToneMaterialSelection(channel, note, false))
    shiftedNotes.forEach(note => toggleToneMaterialSelection(channel, note, true))
    channel.toneMaterialCursor = shiftedNotes[shiftedNotes.length - 1] ?? null
  }

  function toggleToneMaterialSelection(
    channel: typeof channels[number],
    note: number,
    active: boolean,
    octaves = channel.selectedOctaves.length
      ? channel.selectedOctaves
      : [channel.octave]
  ) {
    const pitchOffset = (note % 12 + 12) % 12
    const octaveNotes = octaves.map(octave => 12 * (octave + 1) + pitchOffset)

    if (isKeyTone(channel, note)) {
      channel.excludedNotes = active
        ? channel.excludedNotes.filter(candidate => !octaveNotes.includes(candidate))
        : [...new Set([...channel.excludedNotes, ...octaveNotes])].sort((a, b) => a - b)
    } else {
      channel.additionalNotes = active
        ? [...new Set([...channel.additionalNotes, ...octaveNotes])].sort((a, b) => a - b)
        : channel.additionalNotes.filter(candidate => !octaveNotes.includes(candidate))
    }
  }

  function toggleMicrotones() {
    const channel = currentChannel.value
    channel.microtonesEnabled = !channel.microtonesEnabled
    if (!channel.microtonesEnabled) {
      channel.additionalNotes = channel.additionalNotes.filter(note => Number.isInteger(note))
      channel.excludedNotes = channel.excludedNotes.filter(note => Number.isInteger(note))
    }
  }

  function toggleReduceNotes() {
    currentChannel.value.reduceNotes = !currentChannel.value.reduceNotes
  }

  function setPlaybackMode(index: number, mode: PlaybackMode) {
    const channel = channels[index]
    if (!channel) return
    channel.playbackMode = mode
    if (mode === 'arrangement' && channel.playing) {
      primeArrangement(channel)
    }
  }

  function setArrangementRow(channelIndex: number, rowIndex: number) {
    const channel = channels[channelIndex]
    if (!channel || rowIndex < 0 || rowIndex >= channel.arrangementRows.length) return
    channel.arrangementRowIndex = rowIndex
    channel.playbackMode = 'arrangement'
    channel.followArrangementView = true
    if (channel.playing) primeArrangement(channel)
    else toggleChannelPlay(channelIndex)
  }

  function toggleFollowArrangementView(index: number) {
    const channel = channels[index]
    if (!channel || channel.playbackMode !== 'arrangement') return
    channel.followArrangementView = !channel.followArrangementView
  }

  function setFollowArrangementView(index: number, enabled: boolean) {
    const channel = channels[index]
    if (!channel || channel.playbackMode !== 'arrangement') return
    channel.followArrangementView = enabled
  }

  function cycleStep(payload:any){
    const channel = currentChannel.value
    // payload can be a number (legacy) or {step, note}
    if (typeof payload === 'number') {
      // legacy: toggle through available notes by rotating index into channel.notes
      const stepIndex = payload
      const noteCount = channel.notes.length
      if (noteCount === 0) { channel.steps[stepIndex] = -1; channel.arpeggiator.setSteps(channel.steps); return }
      const current = channel.steps[stepIndex]
      // if current is a MIDI note, find its index among channel.notes
      let idx = typeof current === 'number' ? channel.notes.indexOf(current) : -1
      if (idx === -1) idx = -1
      idx = idx + 1
      if (idx >= noteCount) {
        channel.steps[stepIndex] = -1
      } else {
        channel.steps[stepIndex] = channel.notes[idx]
      }

      channel.arpeggiator.setSteps(channel.steps)
      return
    }

    const { step, note, add = false } = payload
    const newSteps = channel.steps.slice()
    if (add) {
      const current = newSteps[step]
      let sustainSourceIndex = -1
      for (let sourceStep = step - 1; sourceStep >= 0; sourceStep--) {
        const source = newSteps[sourceStep]
        if (isSustainedStep(source) &&
            sourceStep + source.duration >= step &&
            stepNotes(source).includes(note)) {
          sustainSourceIndex = sourceStep
          break
        }
      }
      const previous = newSteps[step - 1]
      const extendsAdjacentNote = current === -1 &&
        (sustainSourceIndex >= 0 || stepNotes(previous).includes(note))

      if (extendsAdjacentNote) {
        if (sustainSourceIndex >= 0) {
          const source = newSteps[sustainSourceIndex]
          if (isSustainedStep(source)) {
            source.duration = Math.max(source.duration, step - sustainSourceIndex + 1)
          }
        } else if (isSustainedStep(previous)) {
          previous.duration = Math.max(previous.duration, 2)
        } else {
          newSteps[step - 1] = { notes: previous, duration: 2 }
        }
      } else {
        const chord = stepNotes(current).slice()
        const noteIndex = chord.indexOf(note)
        if (noteIndex >= 0) chord.splice(noteIndex, 1)
        else chord.push(note)
        chord.sort((a, b) => a - b)
        newSteps[step] = chord.length === 0
          ? -1
          : isSustainedStep(current)
            ? { notes: chord.length === 1 ? chord[0] : chord, duration: current.duration }
            : chord.length === 1 ? chord[0] : chord
        if (chord.length > 0 && !channel.notes.includes(note)) {
          channel.notes = [...channel.notes, note].sort((a, b) => a - b)
        }
      }
    } else if (newSteps[step] === note) newSteps[step] = -1
    else {
      newSteps[step] = note
      if (!channel.notes.includes(note)) {
        channel.notes = [...channel.notes, note].sort((a, b) => a - b)
      }
    }
    channel.steps = newSteps
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setSteps(channel.steps)
  }

  function updateEditorOctaves(octaves: number[]) {
    const selectedOctaves = [...new Set(octaves)]
      .filter(octave => ARPEGGIO_OCTAVES.includes(octave))
      .sort((a, b) => a - b)
    const previousOctaves = currentChannel.value.selectedOctaves.slice()
    const addedOctaves = selectedOctaves.filter(octave => !previousOctaves.includes(octave))

    if (selectedOctaves.length > 1) {
      addedOctaves.forEach(octave => copyToneMaterialsToOctave(currentChannel.value, previousOctaves, octave))
    }
    channelEditorOctaves(currentChannel.value, selectedOctaves)
  }

  function copyToneMaterialsToOctave(
    channel: typeof channels[number],
    sourceOctaves: number[],
    targetOctave: number
  ) {
    getToneMaterials(channel, [targetOctave])
      .filter(note => Math.floor(note / 12) - 1 === targetOctave)
      .forEach(note => toggleToneMaterialSelection(channel, note, false, [targetOctave]))

    const sourcePitchOffsets = [...new Set(sourceOctaves.flatMap(sourceOctave =>
      getToneMaterials(channel, [sourceOctave])
        .filter(note => Math.floor(note / 12) - 1 === sourceOctave)
        .map(note => (note % 12 + 12) % 12)))]

    sourcePitchOffsets.forEach(pitchOffset => {
      toggleToneMaterialSelection(channel, 12 * (targetOctave + 1) + pitchOffset, true, [targetOctave])
    })
  }

  function channelEditorOctaves(channel: typeof channels[number], selectedOctaves: number[]) {
    channel.selectedOctaves = selectedOctaves
    if (selectedOctaves.length === 1 && selectedOctaves[0] !== channel.octave) {
      updateArpeggioOctave(selectedOctaves[0])
    }
  }

  function updateVelocity(payload: { index: number, value: number }) {
    const channel = currentChannel.value
    if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= channel.loopLength) return
    channel.velocities[payload.index] = Math.max(0, Math.min(127, Math.round(payload.value)))
    channel.arpeggiator.setVelocities(channel.velocities)
  }

  function clearNotes(){
    const channel = currentChannel.value
    channel.notes = []
    channel.steps = Array.from({ length: STEP_COUNT }, () => -1)
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setSteps(channel.steps)
  }

  function variationChangeCount(maximum: number) {
    let changes = 1
    while (changes < maximum && Math.random() < ADDITIONAL_VARIATION_CHANGE_CHANCE) changes++
    return changes
  }

  function createVariation(index: number) {
    const channel = channels[index]
    const octaveBase = 12 * (channel.octave + 1)
    const toneMaterials = getToneMaterials(channel, channel.selectedOctaves)
    if (!toneMaterials.length) {
      channel.notes = []
      channel.steps = Array.from({ length: channel.loopLength }, () => -1)
      channel.arpeggiator.setNotes(channel.notes)
      channel.arpeggiator.setSteps(channel.steps)
      return
    }
    const length = Math.max(1, Math.min(32, Math.floor(channel.arpeggioLength)))
    const shuffled = toneMaterials.slice().sort(() => Math.random() - 0.5)
    const currentSelection = [...new Set(channel.notes.filter(note => toneMaterials.includes(note)))]
    const selected = currentSelection.length
      ? currentSelection.slice(0, length)
      : shuffled.slice(0, Math.min(length, shuffled.length))
    while (selected.length < length) {
      selected.push(toneMaterials[Math.floor(Math.random() * toneMaterials.length)])
    }
    const replacements = new Map<number, number>()
    if (currentSelection.length) {
      const positions = Array.from({ length: selected.length }, (_, position) => position)
        .sort(() => Math.random() - 0.5)
        .slice(0, variationChangeCount(selected.length))

      positions.forEach(position => {
        const currentNote = selected[position]
        const candidates = toneMaterials.filter(note => !selected.includes(note))
        if (!candidates.length) return
        const replacement = candidates[Math.floor(Math.random() * candidates.length)]
        selected[position] = replacement
        replacements.set(currentNote, replacement)
      })
    }
    selected.sort((a, b) => a - b)
    const notes: number[] = []

    if (channel.pattern === 'random') {
      notes.push(...selected.sort(() => Math.random() - 0.5))
    } else if (channel.pattern === 'down') {
      notes.push(...selected.reverse())
    } else if (channel.pattern === 'updown') {
      notes.push(...selected, ...selected.slice(1, -1).reverse())
    } else {
      notes.push(...selected)
    }

    const varyChord = (chord: number[]) => {
      return [...new Set(chord.map(note => replacements.get(note) ?? note))].sort((a, b) => a - b)
    }

    const hadNotes = channel.notes.length > 0
    channel.base = octaveBase
    channel.notes = [...new Set(selected)].sort((a, b) => a - b)
    const previousSteps = channel.steps.slice(0, channel.loopLength)
    const hasRhythm = previousSteps.length > 0
    const activeSteps = !hadNotes
      ? Array.from({ length: channel.loopLength }, () => true)
      : hasRhythm
      ? previousSteps.map(step => stepNotes(step).length > 0)
      : Array.from({ length: channel.loopLength }, () => true)
    let notePosition = 0
    const variedSteps = activeSteps.map((isActive, stepIndex) => {
      if (!isActive) return -1
      const previousStep = previousSteps[stepIndex]
      if (isSustainedStep(previousStep)) {
        const variedNotes = varyChord(stepNotes(previousStep))
        return {
          notes: variedNotes.length === 1 ? variedNotes[0] : variedNotes,
          duration: previousStep.duration
        }
      }
      if (Array.isArray(previousStep)) {
        return varyChord(previousStep)
      }

      const note = notes[notePosition % notes.length]
      notePosition++
      return note
    })
    channel.steps = variedSteps
    const chordNotes = variedSteps.flatMap(step => stepNotes(step))
    channel.notes = [...new Set([...channel.notes, ...chordNotes])].sort((a, b) => a - b)
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setSteps(channel.steps)
  }

  function createGlobalVariation() {
    channels.forEach((_, index) => createVariation(index))
  }

  function initializeRandomState() {
    const patterns: Pattern[] = ['up', 'down', 'updown', 'random']
    const quantisations = [3, 4, 6, 8, 9, 12, 16]
    const randomBpm = 80 + Math.floor(Math.random() * 51)
    const randomKey = KEYS[Math.floor(Math.random() * KEYS.length)]

    setGlobalBpm(randomBpm)
    updateGlobalKey(randomKey.name)
    channels.forEach(channel => {
      const pattern = patterns[Math.floor(Math.random() * patterns.length)]
      const quantisation = quantisations[Math.floor(Math.random() * quantisations.length)]
      const noteLength = NOTE_LENGTH_OPTIONS[Math.floor(Math.random() * NOTE_LENGTH_OPTIONS.length)]
      const octave = ARPEGGIO_OCTAVES[Math.floor(Math.random() * ARPEGGIO_OCTAVES.length)]
      const arpeggioLength = 1 + Math.floor(Math.random() * 8)
      const loopLength = 8 + Math.floor(Math.random() * 9)
      channel.pattern = pattern
      channel.quantisation = quantisation
      channel.noteLength = noteLength
      channel.octave = octave
      channel.selectedOctaves = [octave]
      channel.arpeggioLength = arpeggioLength
      channel.loopLength = loopLength
      channel.arpeggiator.setPattern(pattern)
      channel.arpeggiator.setSubdivision(quantisation)
      channel.arpeggiator.setNoteLength(noteLength)
      channel.arpeggiator.setLoopLength(loopLength)
    })
    createGlobalVariation()
    channels.forEach((channel, index) => {
      storedStates.value[index][0] = snapshotChannelState(channel)
    })
  }

  function playKeyboardNote(key: string) {
    const offset = KEYBOARD_NOTE_OFFSETS[key.toLowerCase()]
    if (offset === undefined) return false

    const channel = currentChannel.value
    const note = channel.base + offset
    const outputId = selectedOutputId.value
    const noteLengthMilliseconds = noteLengthToMilliseconds(channel.noteLength, channel.bpm)
    if (!channel.muted && outputId) sendNote(outputId, note, MIDI.VELOCITY_MAX, noteLengthMilliseconds, channel.midiChannel - 1)

    channel.active = true
    log.value.unshift(`${new Date().toISOString()} ${channel.name} NOTE ${note} vel=${MIDI.VELOCITY_MAX} len=${noteLengthMilliseconds}`)
    setTimeout(() => { channel.active = false }, Math.max(noteLengthMilliseconds, 120))
    return true
  }

  async function enableMidi(){
    outputs.value = listOutputs()
    await initMidi()
    outputs.value = listOutputs()
    clockOutputs.value = outputs.value.filter(output => output.id !== SINE_OUTPUT_ID)
    if (clockOutputs.value.length) setClockOutput(clockOutputs.value[0].id)
    clockInputs.value = listInputs()
    if (outputs.value.length) selectedOutputId.value = outputs.value[0].id
  }

  watch(selectedOutputId, (id) => {
    if (id === SINE_OUTPUT_ID) enableSineSynth()
    else disableSineSynth()
    if (id) selectOutput(id)
  })

  function updateChannelBpm(index:number, bpm:number) {
    const channel = channels[index]
    channel.tempoOffset = bpm - globalBpm.value
    channel.bpm = bpm
    channel.arpeggiator.setBpm(bpm)
  }
  function updateMidiChannel(index:number, midiChannel:number) {
    const channel = channels[index]
    channel.midiChannel = Math.max(1, Math.min(16, Math.floor(midiChannel)))
  }
  function updatePattern(pattern:any){ currentChannel.value.arpeggiator.setPattern(pattern); currentChannel.value.pattern = pattern }
  function updateChannelKey(index: number, key: string) {
    const channel = channels[index]
    if (!channel || (key !== NO_KEY && !KEYS.some(candidate => candidate.name === key))) return
    channel.key = key as CircleOfFifthsKey
    if (channel.key === NO_KEY) channel.additionalNotes = []
  }
  function updateNoteLength(length:number){ currentChannel.value.arpeggiator.setNoteLength(length); currentChannel.value.noteLength = length }
  function updateArpeggioLength(length:number){
    currentChannel.value.arpeggioLength = Math.max(1, Math.min(32, Math.floor(length)))
  }
  function updateLoopLength(length:number){
    const channel = currentChannel.value
    const newLen = Math.max(1, Math.min(MAX_LOOP_LENGTH, Math.floor(length)))
    if (!channel.steps) channel.steps = []
    if (channel.steps.length < newLen) {
      const addedSteps = Array.from({ length: newLen - channel.steps.length }, () => -1)
      channel.steps = channel.steps.concat(addedSteps)
    }
    else if (channel.steps.length > newLen) channel.steps = channel.steps.slice(0, newLen)
    if (channel.velocities.length < newLen) {
      channel.velocities = channel.velocities.concat(
        Array.from({ length: newLen - channel.velocities.length }, () => MIDI.VELOCITY_MAX)
      )
    } else if (channel.velocities.length > newLen) {
      channel.velocities = channel.velocities.slice(0, newLen)
    }
    channel.loopLength = newLen
    if (typeof channel.arpeggiator.setLoopLength === 'function') {
      channel.arpeggiator.setLoopLength(newLen)
      // ensure arpeggiator uses the resized steps array
      if (typeof channel.arpeggiator.setSteps === 'function') channel.arpeggiator.setSteps(channel.steps)
    }
  }

  function updateQuantisation(q:number){
    const channel = currentChannel.value
    const newQ = Math.max(1, Math.min(64, Math.floor(q)))
    channel.quantisation = newQ
    if (typeof channel.arpeggiator.setSubdivision === 'function') channel.arpeggiator.setSubdivision(newQ)
  }

  function updateArpeggioOctave(octave: number) {
    const channel = currentChannel.value
    const nextOctave = Math.max(1, Math.min(8, Math.floor(octave)))
    const delta = (nextOctave - channel.octave) * 12
    if (delta === 0) return

    const transposeStep = (step: StepValue): StepValue => {
      if (isSustainedStep(step)) {
        return {
          notes: Array.isArray(step.notes)
            ? step.notes.map(note => note + delta)
            : step.notes + delta,
          duration: step.duration
        }
      }
      if (Array.isArray(step)) return step.map(note => note + delta)
      return step >= 0 ? step + delta : step
    }

    channel.octave = nextOctave
    channel.base += delta
    channel.notes = channel.notes.map(note => note + delta)
    channel.additionalNotes = channel.additionalNotes.map(note => note + delta)
    channel.excludedNotes = channel.excludedNotes.map(note => note + delta)
    channel.steps = channel.steps.map(transposeStep)
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setSteps(channel.steps)
  }

  function shiftChannelNotes(channel: typeof channels[number], direction: 1 | -1) {
    const activeOctaves = channel.selectedOctaves.length
      ? channel.selectedOctaves
      : [channel.octave]
    const activeToneMaterial = getToneMaterials(channel, activeOctaves)
      .filter(note => activeOctaves.includes(Math.floor(note / 12) - 1))
      .sort((a, b) => a - b)
    const shiftPitch = (pitch: number) => {
      const next = direction > 0
        ? activeToneMaterial.find(note => note > pitch)
        : [...activeToneMaterial].reverse().find(note => note < pitch)
      return next ?? (direction > 0 ? activeToneMaterial[0] : activeToneMaterial[activeToneMaterial.length - 1]) ?? pitch
    }

    const shiftStep = (step: StepValue): StepValue => {
      if (typeof step === 'number') return step >= 0 ? shiftPitch(step) : step
      if (Array.isArray(step)) return step.map(shiftPitch)
      if (isSustainedStep(step)) {
        return { ...step, notes: Array.isArray(step.notes) ? step.notes.map(shiftPitch) : shiftPitch(step.notes) }
      }
      return step
    }

    channel.notes = channel.notes.map(shiftPitch)
    channel.steps = channel.steps.map(shiftStep)
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setSteps(channel.steps)
  }

  function shiftCurrentChannelNotes(direction: 1 | -1) {
    shiftChannelNotes(currentChannel.value, direction)
  }

  function shiftAllChannelNotes(direction: 1 | -1) {
    channels.forEach(channel => shiftChannelNotes(channel, direction))
  }

  function shiftStoredStateNotes(channel: typeof channels[number], state: StoredArpeggiatorState, direction: 1 | -1) {
    const activeOctaves = channel.selectedOctaves.length
      ? channel.selectedOctaves
      : [channel.octave]
    const activeToneMaterial = getToneMaterials(channel, activeOctaves)
      .filter(note => activeOctaves.includes(Math.floor(note / 12) - 1))
      .sort((a, b) => a - b)
    const shiftPitch = (pitch: number) => {
      const next = direction > 0
        ? activeToneMaterial.find(note => note > pitch)
        : [...activeToneMaterial].reverse().find(note => note < pitch)
      return next ?? (direction > 0 ? activeToneMaterial[0] : activeToneMaterial[activeToneMaterial.length - 1]) ?? pitch
    }
    const shiftStep = (step: StepValue): StepValue => {
      if (typeof step === 'number') return step >= 0 ? shiftPitch(step) : step
      if (Array.isArray(step)) return step.map(shiftPitch)
      if (isSustainedStep(step)) {
        return { ...step, notes: Array.isArray(step.notes) ? step.notes.map(shiftPitch) : shiftPitch(step.notes) }
      }
      return step
    }

    state.notes = state.notes.map(shiftPitch)
    state.additionalNotes = state.additionalNotes?.map(shiftPitch)
    state.excludedNotes = state.excludedNotes?.map(shiftPitch)
    state.steps = state.steps.map(shiftStep)
  }

  function shiftArrangementNotes(channelIndex: number, direction: 1 | -1) {
    const channel = channels[channelIndex]
    if (!channel) return
    const shiftedStateIndexes = new Set<number>()
    channel.arrangementRows.forEach(row => row.forEach(stateIndex => {
      if (stateIndex === null || shiftedStateIndexes.has(stateIndex)) return
      const state = storedStates.value[channelIndex][stateIndex]
      if (!state) return
      shiftedStateIndexes.add(stateIndex)
      shiftStoredStateNotes(channel, state, direction)
    }))
    const activeStateIndex = channel.arrangementIndex === null
      ? null
      : channel.arrangementRowIndex === null
        ? null
        : channel.arrangementRows[channel.arrangementRowIndex][channel.arrangementIndex]
    const activeState = activeStateIndex === null || activeStateIndex === undefined
      ? null
      : storedStates.value[channelIndex][activeStateIndex]
    if (activeState) applyChannelState(channel, activeState, { applyPlaybackMode: false })
  }

  function shiftAllArrangementNotes(direction: 1 | -1) {
    channels.forEach((_, index) => shiftArrangementNotes(index, direction))
  }

  function cloneStep(step: StepValue): StepValue {
    if (isSustainedStep(step)) {
      return {
        notes: Array.isArray(step.notes) ? step.notes.slice() : step.notes,
        duration: step.duration
      }
    }
    return Array.isArray(step) ? step.slice() : step
  }

  function snapshotChannelState(channel: typeof channels[number]): StoredArpeggiatorState {
    return {
      bpm: channel.bpm,
      tempoOffset: channel.tempoOffset,
      pattern: channel.pattern,
      noteLength: channel.noteLength,
      notes: channel.notes.slice(),
      additionalNotes: channel.additionalNotes.slice(),
      excludedNotes: channel.excludedNotes.slice(),
      steps: channel.steps.map(cloneStep),
      velocities: channel.velocities.slice(),
      base: channel.base,
      octave: channel.octave,
      loopLength: channel.loopLength,
      arpeggioLength: channel.arpeggioLength,
      quantisation: channel.quantisation,
      key: channel.key,
      microtonesEnabled: channel.microtonesEnabled,
      playbackMode: channel.playbackMode
    }
  }

  function cloneStoredState(state: StoredArpeggiatorState | null): StoredArpeggiatorState | null {
    if (!state) return null
    return {
      ...state,
      notes: state.notes.slice(),
      additionalNotes: state.additionalNotes?.slice(),
      excludedNotes: state.excludedNotes?.slice(),
      steps: state.steps.map(cloneStep),
      velocities: state.velocities?.slice()
    }
  }

  function snapshotSeedChannel(channel: typeof channels[number]): SeedChannelState {
    return {
      ...snapshotChannelState(channel),
      midiChannel: channel.midiChannel,
      muted: channel.muted,
      followArrangementView: channel.followArrangementView,
      arrangementRows: channel.arrangementRows.map(row => row.slice()),
      arrangementRowIndex: channel.arrangementRowIndex,
      arrangementIndex: channel.arrangementIndex
    }
  }

  function createSeed(): string {
    const seed: AppSeed = {
      version: 1,
      globalBpm: globalBpm.value,
      globalKey: globalKey.value,
      currentIndex: currentIndex.value,
      channels: channels.map(snapshotSeedChannel),
      storedStates: storedStates.value.map(states => states.map(cloneStoredState)),
      activeStoredStateIndexes: activeStoredStateIndexes.value.slice()
    }
    return `${SEED_PREFIX}${btoa(JSON.stringify(seed))}`
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  function isStepValue(value: unknown): value is StepValue {
    if (typeof value === 'number') return Number.isFinite(value)
    if (Array.isArray(value)) return value.every(note => typeof note === 'number' && Number.isFinite(note))
    if (!isRecord(value)) return false
    const notes = value.notes
    return (typeof notes === 'number' || (Array.isArray(notes) && notes.every(note => typeof note === 'number' && Number.isFinite(note)))) &&
      typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 1
  }

  function isStoredState(value: unknown): value is StoredArpeggiatorState {
    if (!isRecord(value)) return false
    return typeof value.bpm === 'number' && Number.isFinite(value.bpm) &&
      typeof value.tempoOffset === 'number' && Number.isFinite(value.tempoOffset) &&
      typeof value.pattern === 'string' && ['up', 'down', 'updown', 'random'].includes(value.pattern) &&
      typeof value.noteLength === 'number' && Number.isFinite(value.noteLength) &&
      Array.isArray(value.notes) && value.notes.every(note => typeof note === 'number' && Number.isFinite(note)) &&
      (!('additionalNotes' in value) || (Array.isArray(value.additionalNotes) && value.additionalNotes.every(note => typeof note === 'number' && Number.isFinite(note)))) &&
      (!('excludedNotes' in value) || (Array.isArray(value.excludedNotes) && value.excludedNotes.every(note => typeof note === 'number' && Number.isFinite(note)))) &&
      Array.isArray(value.steps) && value.steps.every(isStepValue) &&
      (!('velocities' in value) || (Array.isArray(value.velocities) && value.velocities.every(velocity => typeof velocity === 'number' && Number.isFinite(velocity) && velocity >= 0 && velocity <= 127))) &&
      typeof value.base === 'number' && Number.isFinite(value.base) &&
      typeof value.octave === 'number' && Number.isFinite(value.octave) &&
      typeof value.loopLength === 'number' && Number.isFinite(value.loopLength) &&
      typeof value.arpeggioLength === 'number' && Number.isFinite(value.arpeggioLength) &&
      typeof value.quantisation === 'number' && Number.isFinite(value.quantisation) &&
      typeof value.key === 'string' && (value.key === NO_KEY || KEYS.some(key => key.name === value.key)) &&
      (!('microtonesEnabled' in value) || typeof value.microtonesEnabled === 'boolean') &&
      (!('playbackMode' in value) || isPlaybackMode(value.playbackMode))
  }

  function isSeedChannel(value: unknown): value is SeedChannelState {
    return isStoredState(value) && isRecord(value) &&
      typeof value.midiChannel === 'number' && Number.isInteger(value.midiChannel) &&
      value.midiChannel >= 1 && value.midiChannel <= 16 &&
      typeof value.muted === 'boolean' &&
      (!('playbackMode' in value) || isPlaybackMode(value.playbackMode)) &&
      (!('followArrangementView' in value) || typeof value.followArrangementView === 'boolean') &&
      (!('arrangementSlots' in value) || (Array.isArray(value.arrangementSlots) && (value.arrangementSlots.length === STORED_STATE_COUNT || value.arrangementSlots.length === ARRANGEMENT_SLOT_COUNT) && value.arrangementSlots.every(slot => slot === null || isValidStoredStateIndex(slot)))) &&
      (!('arrangementRows' in value) || (Array.isArray(value.arrangementRows) && value.arrangementRows.length >= 1 && value.arrangementRows.length <= ARRANGEMENT_ROW_COUNT && value.arrangementRows.every(row => Array.isArray(row) && row.length === ARRANGEMENT_SLOT_COUNT && row.every(slot => slot === null || isValidStoredStateIndex(slot))))) &&
      (!('arrangementRowIndex' in value) || value.arrangementRowIndex === null || (typeof value.arrangementRowIndex === 'number' && Number.isInteger(value.arrangementRowIndex) && value.arrangementRowIndex >= 0 && value.arrangementRowIndex < ARRANGEMENT_ROW_COUNT)) &&
      (!('arrangementIndex' in value) || value.arrangementIndex === null || (typeof value.arrangementIndex === 'number' && Number.isInteger(value.arrangementIndex) && value.arrangementIndex >= 0 && value.arrangementIndex < ARRANGEMENT_SLOT_COUNT))
  }

  function decodeSeed(seedKey: string): AppSeed | null {
    if (!seedKey.startsWith(SEED_PREFIX)) return null
    try {
      const value: unknown = JSON.parse(atob(seedKey.slice(SEED_PREFIX.length)))
      if (!isRecord(value) ||
          value.version !== 1 ||
          typeof value.globalBpm !== 'number' || !Number.isFinite(value.globalBpm) ||
          typeof value.globalKey !== 'string' ||
          (value.globalKey !== NO_KEY && !KEYS.some(key => key.name === value.globalKey)) ||
          typeof value.currentIndex !== 'number' || !Number.isInteger(value.currentIndex) ||
          !Array.isArray(value.channels) || value.channels.length !== channels.length ||
          !value.channels.every(isSeedChannel) ||
          !Array.isArray(value.storedStates) || value.storedStates.length !== channels.length ||
          !value.storedStates.every(states => Array.isArray(states) && states.length === STORED_STATE_COUNT && states.every(state => state === null || isStoredState(state))) ||
          !Array.isArray(value.activeStoredStateIndexes) || value.activeStoredStateIndexes.length !== channels.length ||
          !value.activeStoredStateIndexes.every(index => index === null || (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < STORED_STATE_COUNT)) ||
          value.currentIndex < 0 || value.currentIndex >= channels.length) {
        return null
      }
      return value as unknown as AppSeed
    } catch {
      return null
    }
  }

  function applyChannelState(channel: typeof channels[number], state: StoredArpeggiatorState, options?: { applyPlaybackMode?: boolean }) {
    const shouldApplyPlaybackMode = options?.applyPlaybackMode !== false
    channel.bpm = state.bpm
    channel.tempoOffset = state.tempoOffset
    channel.pattern = state.pattern
    channel.noteLength = state.noteLength
    channel.notes = state.notes.slice()
    channel.additionalNotes = state.additionalNotes?.slice() ?? []
    channel.excludedNotes = state.excludedNotes?.slice() ?? []
    channel.steps = state.steps.map(cloneStep)
    channel.velocities = state.velocities?.slice() ?? channel.velocities.map(() => MIDI.VELOCITY_MAX)
    channel.base = state.base
    channel.octave = state.octave
    channel.loopLength = state.loopLength
    channel.arpeggioLength = state.arpeggioLength
    channel.quantisation = state.quantisation
    channel.key = state.key
    channel.microtonesEnabled = state.microtonesEnabled ?? false
    channel.followArrangementView = channel.followArrangementView ?? false
    if (shouldApplyPlaybackMode) channel.playbackMode = state.playbackMode ?? 'state'

    channel.arpeggiator.setBpm(channel.bpm)
    channel.arpeggiator.setPattern(channel.pattern)
    channel.arpeggiator.setNoteLength(channel.noteLength)
    channel.arpeggiator.setNotes(channel.notes)
    channel.arpeggiator.setLoopLength(channel.loopLength)
    channel.arpeggiator.setSubdivision(channel.quantisation)
    channel.arpeggiator.setSteps(channel.steps)
    channel.arpeggiator.setVelocities(channel.velocities)
  }

  function loadSeed(seedKey: string): string | null {
    const seed = decodeSeed(seedKey.trim())
    if (!seed) return 'Invalid seed key'

    setGlobalBpm(seed.globalBpm)
    updateGlobalKey(seed.globalKey)
    storedStates.value = seed.storedStates.map(states => states.map(cloneStoredState))
    activeStoredStateIndexes.value = seed.activeStoredStateIndexes.slice()
    seed.channels.forEach((state, index) => {
      const channel = channels[index]
      channel.midiChannel = state.midiChannel
      channel.muted = state.muted
      channel.playbackMode = state.playbackMode ?? 'state'
      channel.followArrangementView = state.followArrangementView ?? false
      channel.arrangementRows = createArrangementRows(state.arrangementRows, state.arrangementSlots)
      channel.arrangementRowIndex = typeof state.arrangementRowIndex === 'number'
        ? Math.max(0, Math.min(ARRANGEMENT_ROW_COUNT - 1, Math.floor(state.arrangementRowIndex)))
        : null
      channel.arrangementIndex = typeof state.arrangementIndex === 'number'
        ? Math.max(0, Math.min(ARRANGEMENT_SLOT_COUNT - 1, Math.floor(state.arrangementIndex)))
        : null
      applyChannelState(channel, state)
      normalizeArrangement(channel)
    })
    currentIndex.value = seed.currentIndex
    return null
  }

  function selectNextEmptyStoredState(channelIndex: number, storedStateIndex: number) {
    const states = storedStates.value[channelIndex]
    for (let index = storedStateIndex + 1; index < states.length; index++) {
      if (!states[index]) {
        activeStoredStateIndexes.value[channelIndex] = index
        return
      }
    }
  }

  function storeCurrentState() {
    const channelIndex = currentIndex.value
    const selectedIndex = activeStoredStateIndexes.value[channelIndex] ?? 0
    storedStates.value[channelIndex][selectedIndex] = snapshotChannelState(currentChannel.value)
    selectNextEmptyStoredState(channelIndex, selectedIndex)
  }

  function applyStoredState(index: number) {
    const state = storedStates.value[currentIndex.value][index]
    activeStoredStateIndexes.value[currentIndex.value] = index
    if (!state) return

    applyChannelState(currentChannel.value, state)
    normalizeArrangement(currentChannel.value)
  }

  function clearStoredState(index: number) {
    storedStates.value[currentIndex.value][index] = null
    if (activeStoredStateIndexes.value[currentIndex.value] === index) {
      activeStoredStateIndexes.value[currentIndex.value] = null
    }
  }

  function storeAllStates() {
    channels.forEach((channel, channelIndex) => {
      const selectedIndex = activeStoredStateIndexes.value[channelIndex] ?? 0
      storedStates.value[channelIndex][selectedIndex] = snapshotChannelState(channel)
      selectNextEmptyStoredState(channelIndex, selectedIndex)
    })
  }

  function applyAllStoredStates(index: number) {
    channels.forEach((channel, channelIndex) => {
      activeStoredStateIndexes.value[channelIndex] = index
      const state = storedStates.value[channelIndex][index]
      if (state) applyChannelState(channel, state)
    })
  }

  function clearAllStoredStates(index: number) {
    channels.forEach((_, channelIndex) => {
      storedStates.value[channelIndex][index] = null
      if (activeStoredStateIndexes.value[channelIndex] === index) {
        activeStoredStateIndexes.value[channelIndex] = null
      }
    })
  }

  function copyChannel(sourceIndex: number, targetIndex: number) {
    const source = channels[sourceIndex]
    const target = channels[targetIndex]
    if (!source || !target || source === target) return

    target.bpm = source.bpm
    target.tempoOffset = source.tempoOffset
    target.pattern = source.pattern
    target.noteLength = source.noteLength
    target.notes = source.notes.slice()
    target.additionalNotes = source.additionalNotes.slice()
    target.excludedNotes = source.excludedNotes.slice()
    target.reduceNotes = source.reduceNotes
    target.steps = source.steps.map(cloneStep)
    target.base = source.base
    target.octave = source.octave
    target.selectedOctaves = source.selectedOctaves.slice()
    target.loopLength = source.loopLength
    target.arpeggioLength = source.arpeggioLength
    target.quantisation = source.quantisation
    target.key = source.key
    target.microtonesEnabled = source.microtonesEnabled
    target.playbackMode = source.playbackMode
    target.followArrangementView = source.followArrangementView
    target.arrangementRows = source.arrangementRows.map(row => row.slice())
    target.arrangementRowIndex = source.arrangementRowIndex
    target.arrangementIndex = source.arrangementIndex
    target.muted = source.muted
    storedStates.value[targetIndex] = storedStates.value[sourceIndex].map(cloneStoredState)
    activeStoredStateIndexes.value[targetIndex] = activeStoredStateIndexes.value[sourceIndex]
    activeArrangementStateIndexes.value[targetIndex] = activeArrangementStateIndexes.value[sourceIndex]

    target.arpeggiator.setBpm(target.bpm)
    target.arpeggiator.setPattern(target.pattern)
    target.arpeggiator.setNoteLength(target.noteLength)
    target.arpeggiator.setNotes(target.notes)
    target.arpeggiator.setLoopLength(target.loopLength)
    target.arpeggiator.setSubdivision(target.quantisation)
    target.arpeggiator.setSteps(target.steps)
    normalizeArrangement(target)

    if (source.playing && target.playing) {
      target.arpeggiator.startAlignedTo(source.arpeggiator)
    }
  }

  function setArrangementSlot(channelIndex: number, rowIndex: number, slotIndex: number, sourceStateIndex: number | null) {
    const channel = channels[channelIndex]
    if (!channel || rowIndex < 0 || rowIndex >= channel.arrangementRows.length || slotIndex < 0 || slotIndex >= channel.arrangementRows[rowIndex].length) return
    if (sourceStateIndex !== null && !isValidStoredStateIndex(sourceStateIndex)) return

    channel.arrangementRows[rowIndex][slotIndex] = sourceStateIndex
    normalizeArrangement(channel)
  }

  function moveArrangementSlot(channelIndex: number, fromRowIndex: number, fromIndex: number, toRowIndex: number, toIndex: number) {
    const channel = channels[channelIndex]
    if (!channel || fromRowIndex < 0 || fromRowIndex >= channel.arrangementRows.length || toRowIndex < 0 || toRowIndex >= channel.arrangementRows.length) return
    if (fromRowIndex === toRowIndex && fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= channel.arrangementRows[fromRowIndex].length) return
    if (toIndex < 0 || toIndex >= channel.arrangementRows[toRowIndex].length) return

    const sourceValue = channel.arrangementRows[fromRowIndex][fromIndex]
    channel.arrangementRows[fromRowIndex][fromIndex] = channel.arrangementRows[toRowIndex][toIndex]
    channel.arrangementRows[toRowIndex][toIndex] = sourceValue
    normalizeArrangement(channel)
  }

  function clearArrangementSlot(channelIndex: number, rowIndex: number, slotIndex: number) {
    setArrangementSlot(channelIndex, rowIndex, slotIndex, null)
  }

  function setArrangementSlots(channelIndex: number, slots: (number | null)[]) {
    const channel = channels[channelIndex]
    if (!channel) return
    channel.arrangementRows = createArrangementRows(undefined, slots)
    normalizeArrangement(channel)
  }

  function addArrangementRow(channelIndex: number) {
    const channel = channels[channelIndex]
    if (!channel || channel.arrangementRows.length >= ARRANGEMENT_ROW_COUNT) return
    channel.arrangementRows.push(createArrangementSlots())
  }

  function setClockOutput(id: string | null) {
    clockOutputId.value = id
    midiClockOutputEnabled.value = id !== null
    midiClockOutput.setOutput(getOutput(id))
    if (id === null) midiClockOutput.stop()
    else if (globalPlaying.value) midiClockOutput.start()
  }

  function setClockInput(id: string | null) {
    clockInputId.value = id
    midiClockInputEnabled.value = id !== null
    midiClockInput.setInput(getInput(id))
  }

  initializeRandomState()

  return {
    channels,
    currentIndex,
    currentChannel,
    allMuted,
    globalBpm,
    globalKey,
    globalPlaying,
    setGlobalBpm,
    updateGlobalKey,
    toggleGlobalPlay,
    stopAll,
    selectChannel,
    toggleChannelPlay,
    toggleMute,
    toggleMuteAll,
    togglePlay,
    toggleToneMaterial,
    toggleMicrotones,
    toggleReduceNotes,
    cycleStep,
    updateVelocity,
    clearNotes,
    createVariation,
    createGlobalVariation,
    playKeyboardNote,
    outputs,
    selectedOutputId,
    clockOutputs,
    clockInputs,
    clockOutputId,
    clockInputId,
    setClockOutput,
    setClockInput,
    enableMidi,
    log,
    updateChannelBpm,
    updateMidiChannel,
    updatePattern,
    updateChannelKey,
    updateNoteLength,
    updateArpeggioLength,
    updateQuantisation,
    updateLoopLength,
    updateArpeggioOctave,
    updateEditorOctaves,
    shiftCurrentChannelNotes,
    shiftCurrentToneMaterial,
    shiftAllChannelNotes,
    shiftArrangementNotes,
    shiftAllArrangementNotes,
    storedStates,
    currentStoredStates,
    currentActiveStoredStateIndex,
    currentActiveArrangementStateIndex,
    storeCurrentState,
    applyStoredState,
    clearStoredState,
    storeAllStates,
    applyAllStoredStates,
    clearAllStoredStates,
    setArrangementSlot,
    moveArrangementSlot,
    clearArrangementSlot,
    setArrangementSlots,
    addArrangementRow,
    setArrangementRow,
    setPlaybackMode,
    toggleFollowArrangementView,
    setFollowArrangementView,
    createSeed,
    loadSeed,
    copyChannel,
  }
}
