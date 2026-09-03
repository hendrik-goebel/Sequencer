export type MidiLearnSource = 'cc' | 'note'

export interface MidiLearnBinding {
  source: MidiLearnSource
  channel: number
  control: number
}

export interface MidiLearnMessage {
  source: MidiLearnSource
  channel: number
  control: number
  value: number
  status: number
}

export function createMidiMixDefaultMappings(channelCount: number): Record<string, MidiLearnBinding> {
  const mappings: Record<string, MidiLearnBinding> = {
    'global-tempo': { source: 'cc', channel: 1, control: 62 }
  }
  const faders = [19, 23, 27, 31, 49, 53, 57, 61]
  const mutes = [1, 2, 3, 4, 5, 6, 7, 8]
  for (let index = 0; index < channelCount; index++) {
    mappings[`channel-${index}-tempo`] = { source: 'cc', channel: 1, control: faders[index] }
    mappings[`channel-${index}-mute`] = { source: 'cc', channel: 1, control: mutes[index] }
  }
  return mappings
}

function sanitizeSevenBit(value: number) {
  const normalized = Math.floor(Number(value))
  return Math.max(0, Math.min(0x7f, Number.isFinite(normalized) ? normalized : 0))
}

function sanitizeMidiByte(value: number) {
  const normalized = Math.floor(Number(value))
  return Math.max(0, Math.min(0xff, Number.isFinite(normalized) ? normalized : 0))
}

export function decodeMidiLearnMessage(data: number[] | ArrayLike<number> | null | undefined): MidiLearnMessage | null {
  if (!data || data.length < 3) return null
  const status = sanitizeMidiByte(Number(data[0]))
  const sourceByte = status & 0xf0
  const channel = (status & 0x0f) + 1
  const control = sanitizeSevenBit(Number(data[1]))
  const value = sanitizeSevenBit(Number(data[2]))

  if (sourceByte === 0xb0) {
    return { source: 'cc', channel, control, value, status }
  }

  if (sourceByte === 0x90 || sourceByte === 0x80) {
    return { source: 'note', channel, control, value: sourceByte === 0x80 ? 0 : value, status }
  }

  return null
}

export function midiLearnBindingMatchesMessage(binding: MidiLearnBinding, message: MidiLearnMessage) {
  return binding.source === message.source &&
    binding.channel === message.channel &&
    binding.control === message.control
}

export function midiLearnBindingLabel(binding: MidiLearnBinding) {
  const sourceLabel = binding.source === 'cc' ? 'CC' : 'NOTE'
  return `${sourceLabel} ch${binding.channel} #${binding.control}`
}

export function midiLearnMessageLabel(message: MidiLearnMessage) {
  return `${midiLearnBindingLabel(message)} val=${message.value}`
}

export function isMidiLearnBinding(value: unknown): value is MidiLearnBinding {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (candidate.source === 'cc' || candidate.source === 'note') &&
    typeof candidate.channel === 'number' &&
    Number.isInteger(candidate.channel) &&
    candidate.channel >= 1 &&
    candidate.channel <= 16 &&
    typeof candidate.control === 'number' &&
    Number.isInteger(candidate.control) &&
    candidate.control >= 0 &&
    candidate.control <= 127
}

export function sanitizeMidiLearnBindings(value: unknown): Record<string, MidiLearnBinding> {
  if (typeof value !== 'object' || value === null) return {}
  const mappings = value as Record<string, unknown>
  const sanitized: Record<string, MidiLearnBinding> = {}
  Object.entries(mappings).forEach(([targetId, binding]) => {
    if (isMidiLearnBinding(binding)) sanitized[targetId] = binding
  })
  return sanitized
}
