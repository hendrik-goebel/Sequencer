<template>
  <section class="midi-clock-panel">
    <h3>MIDI CLOCK</h3>
    <div class="clock-controls">
      <label>Clock out
        <select :value="clockOutputId" @change="$emit('set-clock-output', $event.target.value || null)">
          <option value="">Off</option>
          <option v-for="output in clockOutputs" :key="output.id" :value="output.id">{{ output.name }}</option>
        </select>
      </label>
      <label>Clock in
        <select :value="clockInputId" @change="$emit('set-clock-input', $event.target.value || null)">
          <option value="">Off</option>
          <option v-for="input in clockInputs" :key="input.id" :value="input.id">{{ input.name }}</option>
        </select>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  clockOutputs: any[]
  clockInputs: any[]
  clockOutputId: string | null
  clockInputId: string | null
}>()

defineEmits<{
  (event: 'set-clock-output', id: string | null): void
  (event: 'set-clock-input', id: string | null): void
}>()
</script>

<style scoped>
.midi-clock-panel {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg-raised);
}

h3, label {
  color: var(--text-muted);
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: .13em;
}

h3 { color: var(--teal); }

.clock-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .8rem 1rem;
}

label { display: grid; gap: .38rem; }

select {
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .45rem .5rem;
  background: var(--bg-control);
  color: #e7f6fb;
  font: 600 .75rem ui-monospace, monospace;
  outline: none;
}

select:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 2px rgba(104, 216, 195, .12);
}

@media (max-width: 560px) {
  .clock-controls { grid-template-columns: 1fr; }
}
</style>
