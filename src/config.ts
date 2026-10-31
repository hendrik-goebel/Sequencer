export const DEFAULT_BPM = 120
export const NOTE_LENGTH_OPTIONS = [1, 2, 4, 3, 8, 16, 32, 64] as const
export const DEFAULT_NOTE_LENGTH = 4
export function noteLengthToMilliseconds(denominator: number, bpm: number) {
  const safeDenominator = Math.max(1, Number(denominator) || 1)
  const safeBpm = Math.max(1, Number(bpm) || DEFAULT_BPM)
  return (60000 * 4) / (safeBpm * safeDenominator)
}
export const DEFAULT_QUANT = 4
export const CHANNEL_COUNT = 8
export const STORED_STATE_COUNT = 16
export const ARRANGEMENT_SLOT_COUNT = 16
export const ARRANGEMENT_ROW_COUNT = 4
export const STEP_COUNT = 16
export const MAX_LOOP_LENGTH = 2048
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
export const OCTAVE_OFFSET = -1
export const DEFAULT_STEPS = [60,64,67,60,64,67,60,64,60,64,67,60,64,67,60,64]
export const DEFAULT_NOTES = [60,64,67]
export const DEFAULT_BASE = 60
export const DEFAULT_ARPEGGIO_OCTAVE = 4
export const ARPEGGIO_OCTAVES = Array.from({ length: 8 }, (_, index) => index + 1)
export const NOTE_EDITOR_OCTAVES = ARPEGGIO_OCTAVES.length
export const KEYBOARD_OCTAVE_SIZE = 12
export const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]
export const SCALES = {
  major: { label: 'Ionian (Major)', offsets: MAJOR_SCALE_OFFSETS },
  dorian: { label: 'Dorian', offsets: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'Phrygian', offsets: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: 'Lydian', offsets: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: 'Mixolydian', offsets: [0, 2, 4, 5, 7, 9, 10] },
  aeolian: { label: 'Aeolian (Natural minor)', offsets: [0, 2, 3, 5, 7, 8, 10] },
  locrian: { label: 'Locrian', offsets: [0, 1, 3, 5, 6, 8, 10] },
  'melodic-minor': { label: 'Melodic minor', offsets: [0, 2, 3, 5, 7, 9, 11] },
  'harmonic-minor': { label: 'Harmonic minor', offsets: [0, 2, 3, 5, 7, 8, 11] },
  'phrygian-dominant': { label: 'Phrygian dominant', offsets: [0, 1, 4, 5, 7, 8, 10] },
  'whole-tone': { label: 'Whole tone', offsets: [0, 2, 4, 6, 8, 10] },
  'major-pentatonic': { label: 'Major pentatonic', offsets: [0, 2, 4, 7, 9] },
  'minor-pentatonic': { label: 'Minor pentatonic', offsets: [0, 3, 5, 7, 10] },
  'maqam-rast': { label: 'Maqam Rast (quarter-tone)', offsets: [0, 2, 3.5, 5, 7, 9, 10.5] },
  'maqam-bayati': { label: 'Maqam Bayati (quarter-tone)', offsets: [0, 1.5, 3, 5, 7, 8, 10] },
  mohanam: { label: 'Mohanam / Bhoopali', offsets: [0, 2, 4, 7, 9] },
  'mohanam-quarter-tone': { label: 'Mohanam (experimental quarter-tone)', offsets: [0, 2.5, 4, 7, 9.5] },
  hindolam: { label: 'Hindolam / Malkauns', offsets: [0, 3, 5, 8, 10] },
  'hindolam-quarter-tone': { label: 'Hindolam (experimental quarter-tone)', offsets: [0, 3.5, 5, 8.5, 10] },
  yaman: { label: 'Yaman / Kalyani', offsets: [0, 2, 4, 6, 7, 9, 11] },
  'yaman-quarter-tone': { label: 'Yaman (experimental quarter-tone)', offsets: [0, 2, 4.5, 6, 7, 9, 11] },
  bhairavi: { label: 'Bhairavi', offsets: [0, 1, 3, 5, 7, 8, 10] },
  'bhairavi-quarter-tone': { label: 'Bhairavi (experimental quarter-tone)', offsets: [0, 1.5, 3.5, 5, 7, 8.5, 10.5] },
  bhairav: { label: 'Bhairav', offsets: [0, 1, 4, 5, 7, 8, 11] },
  'bhairav-quarter-tone': { label: 'Bhairav (experimental quarter-tone)', offsets: [0, 1.5, 4, 5, 7, 8.5, 11] }
} as const
export type ScaleName = keyof typeof SCALES
export const MICROTONAL_STEP = 0.5
export const KEYS = [
  { name: 'C', pitchClass: 0 },
  { name: 'G', pitchClass: 7 },
  { name: 'D', pitchClass: 2 },
  { name: 'A', pitchClass: 9 },
  { name: 'E', pitchClass: 4 },
  { name: 'B', pitchClass: 11 },
  { name: 'F#/Gb', pitchClass: 6 },
  { name: 'Db', pitchClass: 1 },
  { name: 'Ab', pitchClass: 8 },
  { name: 'Eb', pitchClass: 3 },
  { name: 'Bb', pitchClass: 10 },
  { name: 'F', pitchClass: 5 }
] as const
export const NO_KEY = 'non' as const
export type CircleOfFifthsKey = typeof KEYS[number]['name'] | typeof NO_KEY

// German keyboard layout: white keys span C through D in the next octave,
// while the black keys continue the chromatic sequence between them.
export const KEYBOARD_NOTE_OFFSETS: Record<string, number> = {
  a: 0,  w: 1,
  s: 2,  e: 3,
  d: 4,
  f: 5,  r: 6,
  g: 7,  t: 8,
  h: 9,  z: 10,
  j: 11,
  k: 12, u: 13,
  l: 14, i: 15,
  o: 16,
  p: 17
}
