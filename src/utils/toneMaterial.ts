import { KEYS, MAJOR_SCALE_OFFSETS, NO_KEY } from '../config'

export interface ToneMaterialSource {
  key: string
  octave: number
  microtonesEnabled: boolean
  additionalNotes: number[]
  excludedNotes: number[]
}

export function getToneMaterials(channel: ToneMaterialSource, octaves = [channel.octave]) {
  const keyPitchClass = KEYS.find(key => key.name === channel.key)?.pitchClass
  const keyPitches = octaves.flatMap(octave => {
    if (channel.key === NO_KEY || keyPitchClass === undefined) return []
    const octaveBase = 12 * (octave + 1)
    return MAJOR_SCALE_OFFSETS.map(offset => octaveBase + ((keyPitchClass + offset) % 12))
  })
  return [...new Set([...keyPitches, ...channel.additionalNotes])]
    .filter(note => !channel.excludedNotes.includes(note))
    .sort((a, b) => a - b)
}
