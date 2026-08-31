import { KEYS, MAJOR_SCALE_OFFSETS, NO_KEY } from '../config'

export interface ToneMaterialSource {
  key: string
  octave: number
  microtonesEnabled: boolean
  additionalNotes: number[]
  excludedNotes: number[]
}

export function getToneMaterials(channel: ToneMaterialSource, octaves = [channel.octave]) {
  // An empty editor selection means the channel's current octave. Keep the
  // material pool scoped here so every consumer (including "var") uses the
  // same octave boundaries for scale and explicitly added notes.
  const activeOctaves = octaves.length ? octaves : [channel.octave]
  const keyPitchClass = KEYS.find(key => key.name === channel.key)?.pitchClass
  const keyPitches = activeOctaves.flatMap(octave => {
    if (channel.key === NO_KEY || keyPitchClass === undefined) return []
    const octaveBase = 12 * (octave + 1)
    return MAJOR_SCALE_OFFSETS.map(offset => octaveBase + ((keyPitchClass + offset) % 12))
  })
  const additionalNotes = channel.additionalNotes.filter(note =>
    activeOctaves.includes(Math.floor(note / 12) - 1))

  return [...new Set([...keyPitches, ...additionalNotes])]
    .filter(note => !channel.excludedNotes.includes(note))
    .sort((a, b) => a - b)
}
