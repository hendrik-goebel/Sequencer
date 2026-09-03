<script setup lang="ts">
import { computed } from 'vue'
import { MidiLearnBinding, midiLearnBindingLabel } from '../midi/midiLearn'

type MidiLearnTargetGroup = 'global' | 'channel' | 'sequence' | 'velocity' | 'randomization'

interface MidiLearnTarget {
  id: string
  label: string
  group: MidiLearnTargetGroup
}

const props = defineProps<{
  inputs: { id: string, name: string }[]
  selectedInputId: string | null
  enabled: boolean
  targets: MidiLearnTarget[]
  mappings: Record<string, MidiLearnBinding>
  activeTargetId: string | null
  lastMessage: string
  status: string
}>()

defineEmits<{
  (event: 'set-input', id: string | null): void
  (event: 'refresh-inputs'): void
  (event: 'toggle-enabled'): void
  (event: 'start-learn', targetId: string): void
  (event: 'cancel-learn'): void
  (event: 'clear-target', targetId: string): void
  (event: 'clear-all'): void
  (event: 'load-defaults'): void
}>()

const groups: Array<{ key: MidiLearnTargetGroup, label: string }> = [
  { key: 'global', label: 'Global' },
  { key: 'channel', label: 'Channel' },
  { key: 'sequence', label: 'Sequence' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'randomization', label: 'Randomization' }
]

const groupedTargets = computed(() =>
  groups
    .map(group => ({
      ...group,
      targets: props.targets.filter(target => target.group === group.key)
    }))
    .filter(group => group.targets.length > 0)
)

function mappingLabel(targetId: string) {
  const binding = props.mappings[targetId]
  return binding ? midiLearnBindingLabel(binding) : '—'
}
</script>

<template>
  <section class="midi-learn-panel">
    <h3 id="midi-learn-title">MIDI LEARN</h3>
    <div class="midi-learn-controls">
      <label>
        Input
        <select :value="selectedInputId ?? ''" @change="$emit('set-input', $event.target.value || null)">
          <option value="">Off</option>
          <option v-for="input in inputs" :key="input.id" :value="input.id">{{ input.name }}</option>
        </select>
      </label>
      <div class="midi-learn-actions">
        <button type="button" @click="$emit('refresh-inputs')">Refresh</button>
        <button type="button" :class="{ active: enabled }" @click="$emit('toggle-enabled')">{{ enabled ? 'Learn on' : 'Learn off' }}</button>
        <button type="button" @click="$emit('cancel-learn')" :disabled="!activeTargetId">Cancel</button>
        <button type="button" @click="$emit('load-defaults')">MIDI Mix defaults</button>
        <button type="button" @click="$emit('clear-all')" :disabled="Object.keys(mappings).length === 0">Clear all</button>
      </div>
    </div>
    <p class="status">{{ status }}</p>
    <p class="message">Last message: {{ lastMessage || 'none' }}</p>
    <div class="target-groups">
      <section v-for="group in groupedTargets" :key="group.key" class="target-group">
        <h4>{{ group.label }}</h4>
        <div class="target-list">
          <div v-for="target in group.targets" :key="target.id" class="target-row" :class="{ learning: activeTargetId === target.id }">
            <span>{{ target.label }}</span>
            <small>{{ mappingLabel(target.id) }}</small>
            <button type="button" @click="$emit('start-learn', target.id)">{{ activeTargetId === target.id ? 'Waiting…' : 'Learn' }}</button>
            <button type="button" @click="$emit('clear-target', target.id)" :disabled="!mappings[target.id]">Clear</button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.midi-learn-panel {
  display: grid;
  gap: .8rem;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg-raised);
}
h3, h4, label, .status, .message { margin: 0; color: var(--text-muted); font-size: .62rem; font-weight: 800; letter-spacing: .13em; }
h3 { color: var(--teal); }
h4 { color: var(--lavender-soft); font-size: .58rem; }
.midi-learn-controls { display: grid; gap: .7rem; }
label { display: grid; gap: .38rem; }
select {
  min-width: 0;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .45rem .5rem;
  background: var(--bg-control);
  color: #e7f6fb;
  font: 600 .75rem ui-monospace, monospace;
  outline: none;
}
select:focus { border-color: var(--teal); box-shadow: 0 0 0 2px rgba(104, 216, 195, .12); }
.midi-learn-actions { display: flex; flex-wrap: wrap; gap: .45rem; }
.midi-learn-actions button, .target-row button {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .45rem .65rem;
  background: #1c2a33;
  color: var(--text);
  font-size: .56rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}
.midi-learn-actions button.active {
  border-color: var(--teal);
  background: var(--teal-deep);
  color: var(--teal-soft);
}
.midi-learn-actions button:disabled, .target-row button:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.status { color: var(--teal-soft); }
.message { color: var(--text-dim); }
.target-groups { display: grid; gap: .7rem; }
.target-group { display: grid; gap: .4rem; }
.target-list { display: grid; gap: .35rem; }
.target-row {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) minmax(9rem, auto) auto auto;
  align-items: center;
  gap: .5rem;
  padding: .35rem .4rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-control);
}
.target-row span { color: var(--text); font-size: .66rem; }
.target-row small { color: var(--text-dim); font: 600 .6rem ui-monospace, monospace; }
.target-row.learning { border-color: var(--teal); box-shadow: 0 0 0 1px rgba(104, 216, 195, .35); }
@media (max-width: 680px) {
  .target-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name name'
      'binding binding'
      'learn clear';
  }
  .target-row span { grid-area: name; }
  .target-row small { grid-area: binding; }
  .target-row button:first-of-type { grid-area: learn; }
  .target-row button:last-of-type { grid-area: clear; }
}
</style>
