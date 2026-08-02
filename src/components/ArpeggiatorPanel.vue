<script setup lang="ts">
import { computed } from 'vue'
import StepsGrid from './StepsGrid.vue'
import StepperControl from './StepperControl.vue'
import VerticalSlider from './VerticalSlider.vue'
import { ARPEGGIO_OCTAVES, DEFAULT_BASE, KEYBOARD_OCTAVE_SIZE, MICROTONAL_STEP, NOTE_LENGTH_OPTIONS } from '../config'
import { StoredArpeggiatorState } from '../models/channel'
import { getToneMaterials } from '../utils/toneMaterial'

const props = defineProps<{ channel: any, log: string[], storedStates: (StoredArpeggiatorState | null)[], activeStoredStateIndex: number | null, globalActions: boolean }>()

const base = computed(() => props.channel?.base ?? DEFAULT_BASE)
const toneMaterialNotes = computed(() => props.channel ? getToneMaterials(props.channel) : [])
const fullNotes = computed(() => {
  const step = props.channel?.microtonesEnabled ? MICROTONAL_STEP : 1
  const length = props.channel?.microtonesEnabled ? KEYBOARD_OCTAVE_SIZE * 2 : KEYBOARD_OCTAVE_SIZE
  return Array.from({ length }, (_, i) => base.value + i * step).reverse()
})
const displayedNotes = computed(() => props.channel?.reduceNotes
  ? fullNotes.value.filter(note =>
      toneMaterialNotes.value.includes(note) ||
      (props.channel.microtonesEnabled &&
        toneMaterialNotes.value.includes(note - MICROTONAL_STEP)))
  : fullNotes.value)
</script>

<template>
  <section class="arpeggiator-panel">
    <div class="controls">
      <div class="channel-section-heading">
        <span class="module-index">{{ String(channel.id + 1).padStart(2, '0') }}</span>
        <h3>CHANNEL {{ channel.id + 1 }}</h3>
      </div>
      <div class="control-section sequence-section">
        <h3>SEQUENCE</h3>
        <label>Pattern <StepperControl :value="channel.pattern" :values="['up', 'down', 'updown', 'random']" @update:value="$emit('update-pattern', $event)" /></label>
        <label>Arpeggio length <span class="value-input"><input type="number" :value="channel.arpeggioLength" @input="$emit('update-arpeggio-length', +$event.target.value)" min="1" max="32" /><small>NOTES</small></span></label>
        <label>Quantisation <StepperControl :value="channel.quantisation" :values="[1, 2, 3, 4, 5, 8, 16, 32, 64]" @update:value="$emit('update-quant', +$event)" /></label>
        <label>Loop length <span class="value-input"><input type="number" :value="channel.loopLength" @input="$emit('update-loop-length', +$event.target.value)" min="1" max="64" /><small>STEPS</small></span></label>
        <label>Note length <StepperControl :value="channel.noteLength" :values="NOTE_LENGTH_OPTIONS" @update:value="$emit('update-noteLength', +$event)" /></label>
        <label>Octave
          <select :value="channel.octave" @change="$emit('update-octave', +$event.target.value)">
            <option v-for="octave in ARPEGGIO_OCTAVES" :key="octave" :value="octave">C{{ octave }}</option>
          </select>
        </label>
      </div>
    </div>

    <div class="sequencer">
      <button type="button" class="microtones-button" :class="{ active: channel.microtonesEnabled }" :aria-pressed="channel.microtonesEnabled" @click="$emit('toggle-microtones')">micro</button>
      <button type="button" class="reduce-button" :class="{ active: channel.reduceNotes }" :aria-pressed="channel.reduceNotes" @click="$emit('toggle-reduce-notes')">reduce</button>
      <StepsGrid :notes="displayedNotes" :steps="channel.steps" :base="channel.base" :key-root="channel.key" :microtones-enabled="channel.microtonesEnabled" :additional-notes="channel.additionalNotes" :excluded-notes="channel.excludedNotes" :play-step="channel.playStep" :step-count="channel.loopLength" @toggle-tone-material="$emit('toggle-tone-material', $event)" @toggle-step="$emit('cycle-step', $event)" />
      <div class="velocity-row">
        <span class="velocity-label">VELOCITY</span>
        <VerticalSlider v-for="(velocity, index) in channel.velocities.slice(0, channel.loopLength)" :key="index" :value="velocity" :min="0" :max="127" :label="`Velocity step ${index + 1}`" @update:value="$emit('update-velocity', { index, value: $event })" />
      </div>
    </div>
    <div class="state-storage">
      <button class="variation-button" @click="$emit('channel-variation')">var</button>
      <button class="variation-button" aria-label="Move arpeggio notes up" @click="$emit('shift-notes', 1)">up</button>
      <button class="variation-button" aria-label="Move arpeggio notes down" @click="$emit('shift-notes', -1)">down</button>
      <button class="store-button" @click="$emit('store-state')">Store state</button>
      <div class="stored-states">
        <button
          v-for="(_, index) in storedStates"
          :key="index"
          class="stored-state-button"
          :class="{ active: index === activeStoredStateIndex, empty: !storedStates[index] }"
          :aria-label="`${storedStates[index] ? 'Apply' : 'Select'} stored state ${index + 1}`"
          @click="$emit('apply-stored-state', index)"
        >{{ index + 1 }}</button>
      </div>
      <button class="clear-button" @click="$emit('clear-notes')">Clear grid</button>
      <button class="global-button" :class="{ active: globalActions }" :aria-pressed="globalActions" @click="$emit('toggle-global-actions')">global</button>
    </div>
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
.sequencer { overflow-x: auto; }
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
.stored-states { display: flex; flex-wrap: wrap; gap: .35rem; }
.stored-state-button { min-width: 2rem; color: var(--lavender-soft); background: var(--lavender-deep); }
.stored-state-button.empty { border-style: dashed; color: #71828c; background: #152029; }
.stored-state-button.active { border-color: var(--teal); background: var(--teal-deep); color: var(--teal-soft); box-shadow: 0 0 8px rgba(104, 216, 195, .28); }
.section-label { display: flex; justify-content: space-between; margin: 0 0 .6rem; }
.section-label span { color: #52636f; font-size: .55rem; }
@media (max-width: 560px) { .arpeggiator-panel { padding: .8rem; } .sequence-section { grid-template-columns: 1fr 1fr; } .sequence-section h3 { grid-column: 1 / -1; } .routing { grid-template-columns: 1fr; } .control-column { grid-template-columns: 1fr 1fr; } }
</style>
