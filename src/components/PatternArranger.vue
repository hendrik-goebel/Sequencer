<template>
  <section class="pattern-arranger">
    <div class="section-heading">
      <div class="heading-title">
        <h3>ARRANGE</h3>
      </div>
      <div class="heading-right">
        <button
          type="button"
          class="enabled-button"
          :class="{ active: playbackMode === 'arrangement' }"
          :aria-pressed="playbackMode === 'arrangement'"
          @click="$emit('toggle-playback-mode')"
        >Enabled</button>
      </div>
    </div>

    <div class="slots">
      <button
        v-for="(slot, index) in arrangementSlots"
        :key="index"
        type="button"
        class="slot"
        :class="{ filled: slot !== null, active: activeArrangementSlotIndex === index }"
        :draggable="slot !== null"
        @dragstart="slot !== null && startSlotDrag(index, $event)"
        @dragover.prevent
        @drop.prevent="handleDrop(index, $event)"
        @click="slot !== null && clearSlot(index)"
        :aria-label="slot === null ? `Empty arrangement slot ${index + 1}` : `Slot ${index + 1}, state ${slot + 1}`"
      >
        <span class="slot-number">{{ slot === null ? '' : slot + 1 }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
const DRAG_TYPE = 'application/x-arpeggiator-arrangement'

const props = defineProps<{
  arrangementSlots: (number | null)[]
  activeArrangementSlotIndex: number | null
  playbackMode: 'state' | 'arrangement'
}>()

const emit = defineEmits<{
  (event: 'assign-slot', payload: { slotIndex: number, stateIndex: number }): void
  (event: 'move-slot', payload: { fromIndex: number, toIndex: number }): void
  (event: 'clear-slot', slotIndex: number): void
  (event: 'toggle-playback-mode'): void
}>()

type DragPayload = { kind: 'stored-state' | 'arrangement-slot', index: number }

function encodeDragPayload(payload: DragPayload) {
  return `${payload.kind}:${payload.index}`
}

function decodeDragPayload(rawValue: string | undefined | null): DragPayload | null {
  if (!rawValue) return null
  const [kind, rawIndex] = rawValue.split(':')
  if (kind !== 'stored-state' && kind !== 'arrangement-slot') return null
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0) return null
  return { kind, index }
}

function startSlotDrag(slotIndex: number, event: DragEvent) {
  event.dataTransfer?.setData(DRAG_TYPE, encodeDragPayload({ kind: 'arrangement-slot', index: slotIndex }))
  event.dataTransfer?.setData('text/plain', encodeDragPayload({ kind: 'arrangement-slot', index: slotIndex }))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleDrop(slotIndex: number, event: DragEvent) {
  const payload = decodeDragPayload(event.dataTransfer?.getData(DRAG_TYPE) || event.dataTransfer?.getData('text/plain'))
  if (!payload) return
  if (payload.kind === 'stored-state') emit('assign-slot', { slotIndex, stateIndex: payload.index })
  else if (payload.index !== slotIndex) emit('move-slot', { fromIndex: payload.index, toIndex: slotIndex })
}

function clearSlot(slotIndex: number) {
  emit('clear-slot', slotIndex)
}
</script>

<style scoped>
.pattern-arranger {
  display: grid;
  gap: .75rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--bg-raised);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
}

.heading-title {
  display: flex;
  align-items: center;
  gap: .5rem;
}

.heading-right {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin-left: auto;
}

.section-heading h3 {
  margin: 0;
  color: var(--teal);
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: .13em;
}

.section-heading span {
  color: var(--text-dim);
  font-size: .55rem;
  font-weight: 800;
  letter-spacing: .08em;
}

.enabled-button {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .35rem .55rem;
  background: #1c2a33;
  color: var(--text-muted);
  font-size: .55rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}

.enabled-button.active {
  border-color: var(--teal);
  background: var(--teal-deep);
  color: var(--teal-soft);
  box-shadow: 0 0 10px rgba(104, 216, 195, .22);
}

.slots {
  display: flex;
  flex-wrap: wrap;
  gap: .35rem;
}

.slot {
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
}

.slot.filled {
  border-style: solid;
  border-color: var(--lavender);
  background: var(--lavender-deep);
  color: var(--lavender-soft);
}

.slot.active {
  border-color: var(--teal);
  background: var(--teal-deep);
  color: var(--teal-soft);
  box-shadow: 0 0 10px rgba(104, 216, 195, .28);
}

.slot-number {
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .08em;
}
</style>
