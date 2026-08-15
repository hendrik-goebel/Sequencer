<script setup lang="ts">
import { computed } from 'vue'
import StepsGrid from './StepsGrid.vue'
import StepperControl from './StepperControl.vue'
import VerticalSlider from './VerticalSlider.vue'
import PatternArranger from './PatternArranger.vue'
import { ARPEGGIO_OCTAVES, ARRANGEMENT_ROW_COUNT, DEFAULT_BASE, KEYBOARD_OCTAVE_SIZE, MICROTONAL_STEP, NOTE_LENGTH_OPTIONS } from '../config'
import { StoredArpeggiatorState } from '../models/channel'
import { getToneMaterials } from '../utils/toneMaterial'

const props = defineProps<{
  channel: any
  log: string[]
  storedStates: (StoredArpeggiatorState | null)[]
  activeStoredStateIndex: number | null
  activeArrangementStoredStateIndex: number | null
  arrangementRows: (number | null)[][]
  activeArrangementRowIndex: number | null
  activeArrangementSlotIndex: number | null
  followArrangementView?: boolean
  globalActions: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-follow-arrangement-view'): void
  (event: 'toggle-arrangement-playback'): void
  (event: 'select-arrangement-row', rowIndex: number): void
  (event: 'toggle-global-actions'): void
  (event: 'toggle-tone-material', note: number): void
  (event: 'cycle-step', payload: any): void
  (event: 'update-velocity', payload: { index: number, value: number }): void
  (event: 'toggle-play'): void
  (event: 'enable-midi'): void
  (event: 'update-pattern', value: any): void
  (event: 'update-noteLength', value: number): void
  (event: 'update-octaves', value: number[]): void
  (event: 'clear-notes'): void
  (event: 'update-loop-length', value: number): void
  (event: 'update-quant', value: number): void
  (event: 'update-arpeggio-length', value: number): void
  (event: 'channel-variation'): void
  (event: 'shift-notes', direction: 1 | -1): void
  (event: 'store-state'): void
  (event: 'apply-stored-state', index: number): void
  (event: 'clear-stored-state', index: number): void
  (event: 'arrangement-assign-slot', payload: { rowIndex: number, slotIndex: number, stateIndex: number }): void
  (event: 'arrangement-move-slot', payload: { fromRowIndex: number, fromIndex: number, toRowIndex: number, toIndex: number }): void
  (event: 'arrangement-clear-slot', payload: { rowIndex: number, slotIndex: number }): void
  (event: 'add-arrangement-row'): void
}>()

const ARRANGEMENT_DRAG_TYPE = 'application/x-arpeggiator-arrangement'

const displayedStoredStateIndex = computed(() =>
  props.followArrangementView && props.channel?.playbackMode === 'arrangement'
    ? (props.activeArrangementStoredStateIndex ?? props.activeStoredStateIndex)
    : props.activeStoredStateIndex
)

const visualChannel = computed(() => {
  if (!props.channel) return props.channel
  if (props.channel.playbackMode !== 'arrangement' || props.followArrangementView) return props.channel

  const selectedState = props.storedStates[props.activeStoredStateIndex ?? -1]
  if (!selectedState) return props.channel

  return {
    ...props.channel,
    ...selectedState,
    additionalNotes: selectedState.additionalNotes ?? [],
    excludedNotes: selectedState.excludedNotes ?? [],
    velocities: selectedState.velocities ?? props.channel.velocities,
    playStep: null,
    playbackMode: props.channel.playbackMode,
    followArrangementView: props.followArrangementView
  }
})

const base = computed(() => visualChannel.value?.base ?? DEFAULT_BASE)
const toneMaterialNotes = computed(() => visualChannel.value
  ? getToneMaterials(visualChannel.value, visualChannel.value.selectedOctaves)
  : [])
const fullNotes = computed(() => {
  const step = visualChannel.value?.microtonesEnabled ? MICROTONAL_STEP : 1
  return ARPEGGIO_OCTAVES.flatMap(octave => {
    const octaveBase = KEYBOARD_OCTAVE_SIZE * (octave + 1)
    const length = visualChannel.value?.microtonesEnabled
      ? KEYBOARD_OCTAVE_SIZE * 2
      : KEYBOARD_OCTAVE_SIZE
    return Array.from({ length }, (_, i) => octaveBase + i * step)
  }).reverse()
})
const displayedNotes = computed(() => visualChannel.value?.reduceNotes
  ? fullNotes.value.filter(note => isDisplayedOctave(note) && (
      toneMaterialNotes.value.includes(note) ||
      (visualChannel.value?.microtonesEnabled &&
        toneMaterialNotes.value.includes(note - MICROTONAL_STEP))))
  : fullNotes.value.filter(isDisplayedOctave))

function isDisplayedOctave(note: number) {
  const selectedOctaves = visualChannel.value?.selectedOctaves ?? [visualChannel.value?.octave]
  const octave = Math.floor(note / KEYBOARD_OCTAVE_SIZE) - 1
  return selectedOctaves.includes(octave)
}

function toggleEditorOctave(octave: number, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const selectedOctaves = new Set(visualChannel.value?.selectedOctaves ?? [])
  if (checked) selectedOctaves.add(octave)
  else selectedOctaves.delete(octave)
  emit('update-octaves', [...selectedOctaves])
}

function encodeDragPayload(kind: 'stored-state', index: number) {
  return `${kind}:${index}`
}

function startStoredStateDrag(index: number, event: DragEvent) {
  const payload = encodeDragPayload('stored-state', index)
  event.dataTransfer?.setData(ARRANGEMENT_DRAG_TYPE, payload)
  event.dataTransfer?.setData('text/plain', payload)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <section class="arpeggiator-panel">
    <div class="controls">
      <div class="channel-section-heading">
        <span class="module-index">{{ String(visualChannel.id + 1).padStart(2, '0') }}</span>
        <h3>CHANNEL {{ visualChannel.id + 1 }}</h3>
      </div>
      <div class="control-section sequence-section">
        <h3>SEQUENCE</h3>
        <label>Pattern <StepperControl :value="visualChannel.pattern" :values="['up', 'down', 'updown', 'random']" @update:value="$emit('update-pattern', $event)" /></label>
        <label>Arpeggio length <span class="value-input"><input type="number" :value="visualChannel.arpeggioLength" @input="$emit('update-arpeggio-length', +$event.target.value)" min="1" max="32" /><small>NOTES</small></span></label>
        <label>Quantisation <StepperControl :value="visualChannel.quantisation" :values="[1, 2, 3, 4, 5, 6, 8, 9, 12, 16, 32, 64]" @update:value="$emit('update-quant', +$event)" /></label>
        <label>Loop length <span class="value-input"><input type="number" :value="visualChannel.loopLength" @input="$emit('update-loop-length', +$event.target.value)" min="1" max="2048" /><small>STEPS</small></span></label>
        <label>Note length <StepperControl :value="visualChannel.noteLength" :values="NOTE_LENGTH_OPTIONS" @update:value="$emit('update-noteLength', +$event)" /></label>
        <div class="octave-control">
          <span>Octave</span>
          <div class="octave-options" role="group" aria-label="Editor octaves">
            <label v-for="octave in ARPEGGIO_OCTAVES" :key="octave" class="octave-option">
              <input
                type="checkbox"
                :checked="visualChannel.selectedOctaves?.includes(octave)"
                :aria-label="`Show octave ${octave}`"
                @change="toggleEditorOctave(octave, $event)"
              />
              C{{ octave }}
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="sequencer">
      <button type="button" class="microtones-button" :class="{ active: visualChannel.microtonesEnabled }" :aria-pressed="visualChannel.microtonesEnabled" @click="$emit('toggle-microtones')">micro</button>
      <button type="button" class="reduce-button" :class="{ active: visualChannel.reduceNotes }" :aria-pressed="visualChannel.reduceNotes" @click="$emit('toggle-reduce-notes')">reduce</button>
      <div class="note-grid-scroll">
        <StepsGrid :notes="displayedNotes" :steps="visualChannel.steps" :base="visualChannel.base" :key-root="visualChannel.key" :microtones-enabled="visualChannel.microtonesEnabled" :additional-notes="visualChannel.additionalNotes" :excluded-notes="visualChannel.excludedNotes" :play-step="visualChannel.playStep" :step-count="visualChannel.loopLength" @toggle-tone-material="$emit('toggle-tone-material', $event)" @toggle-step="$emit('cycle-step', $event)" />
      </div>
      <div class="velocity-row">
        <span class="velocity-label">VELOCITY</span>
        <VerticalSlider v-for="(velocity, index) in visualChannel.velocities.slice(0, visualChannel.loopLength)" :key="index" :value="velocity" :min="0" :max="127" :label="`Velocity step ${index + 1}`" @update:value="$emit('update-velocity', { index, value: $event })" />
      </div>
    </div>
    <div class="state-storage">
      <button class="variation-button" @click="$emit('channel-variation')">var</button>
      <button class="variation-button" aria-label="Move arpeggio notes up" @click="$emit('shift-notes', 1)">up</button>
      <button class="variation-button" aria-label="Move arpeggio notes down" @click="$emit('shift-notes', -1)">down</button>
      <button class="store-button" @click="$emit('store-state')">Store state</button>
      <button class="clear-button" @click="$emit('clear-notes')">Clear grid</button>
      <button
        class="follow-button"
        :class="{ active: followArrangementView && channel.playbackMode === 'arrangement' }"
        :aria-pressed="followArrangementView && channel.playbackMode === 'arrangement'"
        :disabled="channel.playbackMode !== 'arrangement'"
        @click="$emit('toggle-follow-arrangement-view')"
      >follow</button>
      <button class="global-button" :class="{ active: globalActions }" :aria-pressed="globalActions" @click="$emit('toggle-global-actions')">global</button>
      <div class="stored-states">
        <button
          v-for="(_, index) in storedStates"
          :key="index"
          class="stored-state-button"
          :class="{
            active: index === displayedStoredStateIndex,
            empty: !storedStates[index]
          }"
          :draggable="Boolean(storedStates[index])"
          :aria-label="`${storedStates[index] ? 'Apply' : 'Select'} stored state ${index + 1}`"
          @dragstart="storedStates[index] && startStoredStateDrag(index, $event)"
          @click="$emit('apply-stored-state', index)"
          @dblclick="$emit('clear-stored-state', index)"
        >{{ index + 1 }}</button>
      </div>
    </div>
    <PatternArranger
      :arrangement-rows="arrangementRows"
      :active-arrangement-row-index="activeArrangementRowIndex"
      :active-arrangement-slot-index="activeArrangementSlotIndex"
      :playback-mode="channel.playbackMode"
      :max-rows="ARRANGEMENT_ROW_COUNT"
      @assign-slot="$emit('arrangement-assign-slot', $event)"
      @move-slot="$emit('arrangement-move-slot', $event)"
      @clear-slot="$emit('arrangement-clear-slot', $event)"
      @select-row="$emit('select-arrangement-row', $event)"
      @add-row="$emit('add-arrangement-row')"
      @toggle-playback-mode="$emit('toggle-arrangement-playback')"
    />
  </section>
</template>

<style scoped>
.arpeggiator-panel { padding: 1.25rem; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-panel); }
.channel-section-heading { display: flex; align-items: center; gap: .7rem; margin: .25rem 0 -.45rem; }
.channel-section-heading h3 { color: var(--text-muted); }
.panel-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
.panel-title p, h2, h3 { margin: 0; }
.panel-title p, h3, label, .section-label { color: var(--text-muted); font-size: .62rem; font-weight: 800; letter-spacing: .13em; }
h2 { color: #effaff; font-size: 1.15rem; letter-spacing: .08em; }
.play-button { border: 1px solid var(--teal); border-radius: 5px; padding: .7rem 1rem; background: var(--teal-deep); color: var(--teal-soft); font-size: .65rem; font-weight: 800; letter-spacing: .12em; cursor: pointer; }
.play-button span { display: inline-block; width: 0; height: 0; margin-right: .45rem; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid currentColor; }
.play-button.playing { border-color: var(--coral); background: var(--coral-deep); color: var(--coral-soft); }
.play-button.playing span { width: 6px; height: 8px; border: 0; border-left: 2px solid currentColor; border-right: 2px solid currentColor; }
.controls { display: grid; gap: 1.25rem; margin-bottom: 1.25rem; }
.control-section { border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: var(--line); }
.control-section { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem 1rem; padding: 1rem; background: var(--bg-raised); }
.sequence-section { grid-template-columns: minmax(5.5rem, auto) repeat(6, minmax(0, 1fr)); align-items: end; }
.control-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem 1rem; padding: 1rem; background: var(--bg-raised); }
.control-section h3 { grid-column: 1 / -1; color: var(--teal); }
.sequence-section h3 { grid-column: auto; }
.control-section label { display: grid; gap: .38rem; }
.control-column h3 { grid-column: 1 / -1; color: var(--teal); }
.control-column label { display: grid; gap: .38rem; }
select, input { min-width: 0; box-sizing: border-box; border: 1px solid var(--line-strong); border-radius: 4px; padding: .45rem .5rem; background: var(--bg-control); color: #e7f6fb; font: 600 .75rem ui-monospace, monospace; outline: none; }
select:focus, input:focus { border-color: var(--teal); box-shadow: 0 0 0 2px rgba(104, 216, 195, .12); }
.octave-control { display: grid; gap: .38rem; }
.octave-options { display: flex; flex-wrap: wrap; gap: .35rem .6rem; }
.octave-option { display: flex !important; align-items: center; gap: .25rem; color: #e7f6fb !important; cursor: pointer; letter-spacing: .04em !important; white-space: nowrap; }
.octave-option input { width: .85rem; height: .85rem; margin: 0; padding: 0; accent-color: var(--teal); cursor: pointer; }
.value-input { display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); }
.value-input input { width: 100%; border: 0; border-radius: 0; background: transparent; padding: .35rem 0; }
.value-input small { color: var(--teal); font-size: .55rem; }
.clear-button {
  margin-left: auto;
  border: 1px solid var(--line-strong); border-radius: 4px; padding: .5rem .7rem;
  background: #1c2a33; color: var(--coral); font-size: .56rem; font-weight: 800;
  letter-spacing: .06em; cursor: pointer;
}
.global-button {
  border: 1px solid var(--line-strong); border-radius: 4px; padding: .5rem .7rem;
  background: #1c2a33; color: var(--text-muted); font-size: .56rem; font-weight: 800;
  letter-spacing: .06em; cursor: pointer;
}
.global-button.active { border-color: var(--teal); background: var(--teal-deep); color: var(--teal-soft); }
.follow-button {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .5rem .7rem;
  background: #1c2a33;
  color: var(--text-muted);
  font-size: .56rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}
.follow-button.active { border-color: var(--lavender); background: var(--lavender-deep); color: var(--lavender-soft); }
.follow-button:disabled { opacity: .45; cursor: not-allowed; }
.sequencer { overflow-x: auto; }
.note-grid-scroll {
  max-height: 32rem;
  overflow: auto;
  scrollbar-color: var(--line-strong) var(--bg-control);
}
.velocity-row {
  display: flex;
  align-items: flex-end;
  gap: 0;
  min-width: max-content;
  margin-top: .45rem;
  padding: .55rem 7px .35rem 87px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-control);
}
.velocity-label {
  width: 72px;
  flex: 0 0 72px;
  margin-left: -80px;
  margin-right: 8px;
  color: var(--text-dim);
  font-size: .55rem;
  font-weight: 800;
  letter-spacing: .1em;
}
.velocity-row :deep(.vertical-slider) { width: 42px; flex: 0 0 42px; }
.microtones-button {
  display: inline-flex;
  margin: 0 0 .55rem;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .45rem .75rem;
  background: #1c2a33;
  color: var(--text-muted);
  font-size: .56rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}
.microtones-button.active { border-color: var(--lavender); background: var(--lavender-deep); color: var(--lavender-soft); }
.reduce-button {
  display: inline-flex;
  margin: 0 0 .55rem .4rem;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .45rem .75rem;
  background: #1c2a33;
  color: var(--text-muted);
  font-size: .56rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}
.reduce-button.active { border-color: var(--teal); background: var(--teal-deep); color: var(--teal-soft); }
.state-storage {
  display: flex; flex-wrap: wrap; gap: .45rem; align-items: center;
  margin-top: .85rem; padding: 1rem;
  border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg-raised);
}
.store-button, .variation-button, .stored-state-button {
  border: 1px solid var(--line-strong); border-radius: 4px; padding: .5rem .7rem;
  background: #1c2a33; color: var(--text-muted); font-size: .56rem; font-weight: 800;
  letter-spacing: .06em; cursor: pointer;
}
.store-button { border-color: var(--teal); color: var(--teal-soft); background: var(--teal-deep); }
.variation-button { border-color: var(--lavender); color: var(--lavender); background: var(--lavender-deep); }
.stored-states {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem;
  flex-basis: 100%;
  justify-content: flex-start;
  order: 10;
  margin-top: .4rem;
}
.stored-state-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  min-height: 2.35rem;
  padding: .35rem .25rem;
  border: 1px dashed var(--line-strong);
  border-radius: 5px;
  background: #18242d;
  color: var(--text-muted);
  cursor: pointer;
  text-align: center;
  align-content: center;
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .08em;
}
.stored-state-button:not(.empty) {
  border-style: solid;
  border-color: var(--lavender);
  background: var(--lavender-deep);
  color: var(--lavender-soft);
}
.stored-state-button.active {
  border-color: var(--teal);
  background: var(--teal-deep);
  color: var(--teal-soft);
  box-shadow: 0 0 10px rgba(104, 216, 195, .28);
}
.section-label { display: flex; justify-content: space-between; margin: 0 0 .6rem; }
.section-label span { color: #52636f; font-size: .55rem; }
@media (max-width: 560px) { .arpeggiator-panel { padding: .8rem; } .sequence-section { grid-template-columns: 1fr 1fr; } .sequence-section h3 { grid-column: 1 / -1; } .routing { grid-template-columns: 1fr; } .control-column { grid-template-columns: 1fr 1fr; } }
</style>
