import { KEYS, MAJOR_SCALE_OFFSETS } from '../config'

export interface ToneMaterialSource {
  key: string
  octave: number
  microtonesEnabled: boolean
  additionalNotes: number[]
  excludedNotes: number[]
}

export function getToneMaterials(channel: ToneMaterialSource) {
  const octaveBase = 12 * (channel.octave + 1)
  const keyPitchClass = KEYS.find(key => key.name === channel.key)?.pitchClass ?? 0

  const keyPitches = MAJOR_SCALE_OFFSETS.map(offset => octaveBase + ((keyPitchClass + offset) % 12))
  return [...new Set([...keyPitches, ...channel.additionalNotes])]
    .filter(note => !channel.excludedNotes.includes(note))
    .sort((a, b) => a - b)
}
