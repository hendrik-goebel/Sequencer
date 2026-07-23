<template>
  <label class="vertical-slider">
    <span class="slider-value">{{ value }}</span>
    <input
      type="range"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="label"
      @input="$emit('update:value', +$event.target.value)"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{ value: number, min: number, max: number, step?: number, label: string }>()
defineEmits<{ 'update:value': [value: number] }>()
</script>

<style scoped>
.vertical-slider { display: flex; flex-direction: column; align-items: center; gap: .25rem; color: var(--text-dim); font: 600 .55rem ui-monospace, monospace; }
.vertical-slider input { width: 30px; height: 74px; margin: 0; accent-color: var(--teal); writing-mode: vertical-lr; direction: rtl; }
.slider-value { min-width: 2rem; text-align: center; }
</style>
