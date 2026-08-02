<template>
  <section class="output-routing-panel">
    <h3>ROUTING</h3>
    <label>Output
      <select :value="selectedOutputId" @change="$emit('select-output', $event.target.value)">
        <option v-for="output in outputs" :key="output.id" :value="output.id">{{ output.name }}</option>
      </select>
    </label>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  outputs: any[]
  selectedOutputId: string | null
}>()

defineEmits<{
  (event: 'select-output', id: string): void
}>()
</script>

<style scoped>
.output-routing-panel {
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
</style>
