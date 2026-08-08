<template>
  <div class="steps-grid">
    <div class="row header">
      <div class="note-col header-cell"></div>
    <div v-for="i in stepCountArray" :key="i-1" class="step-col header-cell" :class="{playing: props.playStep === (i-1)}">{{ i }}</div>
    </div>

    <div v-for="note in notes" :key="note" class="row" :class="{ 'in-key': isKeyNote(note) && !isExcludedNote(note), 'additional-note': isAdditionalNote(note), 'excluded-note': isExcludedNote(note), 'microtone-note': isMicrotoneNote(note) }">
      <button type="button" class="note-col" :class="{ 'key-note': isKeyNote(note), selected: isSelectedNote(note) }" @click="$emit('toggle-tone-material', note)">{{ noteName(note) }}</button>
      <div v-for="stepIndex in stepCountArray" :key="stepIndex-1" class="step-col"
           :class="{active: isStepActive(stepIndex - 1, note), sustained: isSustainedSource(stepIndex - 1, note), 'sustain-continuation': isSustainedContinuation(stepIndex - 1, note), 'tone-material': isSelectedNote(note), playing: props.playStep === (stepIndex-1)}"
           @click="toggleStep(stepIndex - 1, note, $event)"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { KEYS, STEP_COUNT, NOTE_NAMES, OCTAVE_OFFSET, DEFAULT_BASE, MAJOR_SCALE_OFFSETS } from '../config'
import { isSustainedStep, StepValue, stepNotes } from '../models/arpeggiator'

const props = defineProps<{ notes: number[], steps: StepValue[] | undefined, base?: number, keyRoot?: string, microtonesEnabled?: boolean, additionalNotes?: number[], excludedNotes?: number[], playStep?: number, stepCount?: number }>()

const emit = defineEmits<{
  (event: 'toggle-tone-material', note: number): void
  (event: 'toggle-step', payload: { step: number, note: number, add: boolean }): void
}>()

const base = props.base ?? DEFAULT_BASE
const keyPitchClass = computed(() => KEYS.find(key => key.name === props.keyRoot)?.pitchClass ?? 0)
const keyPitchClasses = computed(() => new Set(MAJOR_SCALE_OFFSETS.map(offset => (keyPitchClass.value + offset) % 12)))

const stepCountArray = computed(() => {
  const cnt = (props.stepCount && props.stepCount > 0) ? props.stepCount : STEP_COUNT
  return Array.from({ length: cnt }, (_, i) => i + 1)
})

function noteName(n:number){
  const pitch = Math.floor(n)
  const octave = Math.floor(pitch / 12) + OCTAVE_OFFSET
  const suffix = Number.isInteger(n) ? '' : '+'
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${octave}${suffix}`
}

function isKeyNote(note: number) {
  return Number.isInteger(note) && keyPitchClasses.value.has((note % 12 + 12) % 12)
}

function isMicrotoneNote(note: number) {
  return props.microtonesEnabled === true && !Number.isInteger(note)
}

function isAdditionalNote(note: number) {
  return props.additionalNotes?.includes(note) ?? false
}

function isExcludedNote(note: number) {
  return props.excludedNotes?.includes(note) ?? false
}

function isSelectedNote(note: number) {
  return !isExcludedNote(note) && (isKeyNote(note) || isAdditionalNote(note))
}

function isStepActive(step: number, note: number) {
  const value = props.steps?.[step]
  if (stepNotes(value).includes(note)) return true
  return props.steps?.some((candidate, sourceStep) =>
    sourceStep < step &&
    isSustainedStep(candidate) &&
    sourceStep + candidate.duration > step &&
    stepNotes(candidate).includes(note)
  ) ?? false
}

function isSustainedSource(step: number, note: number) {
  const value = props.steps?.[step]
  return isSustainedStep(value) && stepNotes(value).includes(note)
}

function isSustainedContinuation(step: number, note: number) {
  return props.steps?.some((candidate, sourceStep) =>
    sourceStep < step &&
    isSustainedStep(candidate) &&
    sourceStep + candidate.duration > step &&
    stepNotes(candidate).includes(note)
  ) ?? false
}

function toggleStep(step: number, note: number, event: MouseEvent) {
  emit('toggle-step', { step, note, add: event.shiftKey })
}
</script>

<style scoped>
.steps-grid { display: inline-block; min-width: 100%; border: 1px solid var(--line); padding: 7px; border-radius: 6px; background: var(--bg-control); }
.row { display: flex; align-items: center }
.row.in-key .step-col { background-color: rgba(181, 185, 239, .24); }
.row.excluded-note .note-col { text-decoration: line-through; }
.row.microtone-note .note-col { letter-spacing: .04em; }
.note-col { width: 72px; padding: 8px; border: 0; border-right: 1px solid var(--line); background: transparent; color: #a9bac4; cursor: pointer; font: 700 .68rem ui-monospace, monospace; text-align: left; }
.note-col.key-note { background-color: rgba(181, 185, 239, .24); }
.note-col.selected { background-color: rgba(104, 216, 195, .2); }
.note-col:hover, .note-col:focus-visible { outline: none; }
.header-cell { color: var(--text-dim); font-size: .65rem; font-weight: 700; transition: color .18s ease, text-shadow .24s ease; }
.step-col { width: 34px; height: 30px; margin: 4px; border: 1px solid var(--line); border-radius: 3px; background: #14232b; cursor: pointer; transition: background .12s, border-color .16s ease, box-shadow .22s ease, transform .16s ease; }
.step-col:hover { border-color: var(--teal); }
.step-col.tone-material:not(.active):not(.sustained):not(.sustain-continuation) { background-color: rgba(104, 216, 195, .2); }
.step-col.active { border-color: var(--teal); background: linear-gradient(145deg, #5ccdbb, #28786f); box-shadow: inset 0 1px rgba(255,255,255,.3), 0 0 8px rgba(104,216,195,.18); }
.step-col.sustained { border-color: var(--gold); background: linear-gradient(145deg, #d8b66c, #876b2c); box-shadow: inset 0 1px rgba(255,255,255,.3), 0 0 8px rgba(216,182,108,.22); }
.step-col.sustain-continuation { border-left-color: var(--gold); border-right-color: var(--gold); background: linear-gradient(90deg, rgba(216,182,108,.5), rgba(216,182,108,.18)); }
.step-col.playing { box-shadow: 0 0 0 2px var(--lavender), 0 0 12px rgba(181, 185, 239, .3); border-color: var(--lavender); transform: scale(1.04); animation: step-note-pulse .45s ease-out; }
.header-cell.playing { color: var(--lavender); text-shadow: 0 0 8px rgba(181, 185, 239, .55); }

@keyframes step-note-pulse {
  0% { box-shadow: 0 0 0 2px var(--lavender), 0 0 0 rgba(181, 185, 239, 0); }
  55% { box-shadow: 0 0 0 2px var(--lavender), 0 0 16px rgba(181, 185, 239, .52); }
  100% { box-shadow: 0 0 0 2px var(--lavender), 0 0 12px rgba(181, 185, 239, .3); }
}

@media (prefers-reduced-motion: reduce) {
  .header-cell, .step-col { transition: none; }
  .step-col.playing { animation: none; }
}
</style>