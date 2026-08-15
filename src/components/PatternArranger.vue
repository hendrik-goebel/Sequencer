<template>
  <section class="pattern-arranger">
    <div class="section-heading">
      <div class="heading-title">
        <h3>ARRANGE</h3>
      </div>
      <button
        type="button"
        class="arrangement-toggle"
        :class="{ active: playbackMode === 'arrangement' }"
        :aria-pressed="playbackMode === 'arrangement'"
        @click="$emit('toggle-playback-mode')"
      >Play arrangement</button>
      <button
        type="button"
        class="add-row-button"
        :disabled="arrangementRows.length >= maxRows"
        @click="$emit('add-row')"
      >Add row</button>
    </div>

    <div class="rows">
      <div v-for="(row, rowIndex) in arrangementRows" :key="rowIndex" class="arrangement-row">
        <button
          type="button"
          class="enabled-button"
          :class="{ active: activeArrangementRowIndex === rowIndex }"
          :aria-pressed="activeArrangementRowIndex === rowIndex"
          @click="$emit('select-row', rowIndex)"
        >Enabled</button>
        <div class="slots">
          <button
            v-for="(slot, slotIndex) in row"
            :key="slotIndex"
            type="button"
            class="slot"
            :class="{ filled: slot !== null, active: activeArrangementRowIndex === rowIndex && activeArrangementSlotIndex === slotIndex && playbackMode === 'arrangement' }"
            :draggable="slot !== null"
            @dragstart="slot !== null && startSlotDrag(rowIndex, slotIndex, $event)"
            @dragover.prevent
            @drop.prevent="handleDrop(rowIndex, slotIndex, $event)"
            @dblclick="slot !== null && clearSlot(rowIndex, slotIndex)"
            :aria-label="slot === null ? `Empty arrangement row ${rowIndex + 1} slot ${slotIndex + 1}` : `Row ${rowIndex + 1}, slot ${slotIndex + 1}, state ${slot + 1}`"
          >
            <span class="slot-number">{{ slot === null ? '' : slot + 1 }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const DRAG_TYPE = 'application/x-arpeggiator-arrangement'

const props = defineProps<{
  arrangementRows: (number | null)[][]
  activeArrangementRowIndex: number | null
  activeArrangementSlotIndex: number | null
  playbackMode: 'state' | 'arrangement'
  maxRows: number
}>()

const emit = defineEmits<{
  (event: 'assign-slot', payload: { rowIndex: number, slotIndex: number, stateIndex: number }): void
  (event: 'move-slot', payload: { fromRowIndex: number, fromIndex: number, toRowIndex: number, toIndex: number }): void
  (event: 'clear-slot', payload: { rowIndex: number, slotIndex: number }): void
  (event: 'select-row', rowIndex: number): void
  (event: 'add-row'): void
  (event: 'toggle-playback-mode'): void
}>()

type DragPayload = { kind: 'stored-state' | 'arrangement-slot', rowIndex?: number, index: number }

function encodeDragPayload(payload: DragPayload) {
  return payload.kind === 'arrangement-slot'
    ? `${payload.kind}:${payload.rowIndex}:${payload.index}`
    : `${payload.kind}:${payload.index}`
}

function decodeDragPayload(rawValue: string | undefined | null): DragPayload | null {
  if (!rawValue) return null
  const [kind, firstValue, secondValue] = rawValue.split(':')
  if (kind !== 'stored-state' && kind !== 'arrangement-slot') return null
  const rowIndex = kind === 'arrangement-slot' ? Number(firstValue) : undefined
  const index = Number(kind === 'arrangement-slot' ? secondValue : firstValue)
  if (!Number.isInteger(index) || index < 0) return null
  if (kind === 'arrangement-slot' && (!Number.isInteger(rowIndex) || rowIndex < 0)) return null
  return { kind, rowIndex, index }
}

function startSlotDrag(rowIndex: number, slotIndex: number, event: DragEvent) {
  const payload = encodeDragPayload({ kind: 'arrangement-slot', rowIndex, index: slotIndex })
  event.dataTransfer?.setData(DRAG_TYPE, payload)
  event.dataTransfer?.setData('text/plain', payload)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function handleDrop(rowIndex: number, slotIndex: number, event: DragEvent) {
  const payload = decodeDragPayload(event.dataTransfer?.getData(DRAG_TYPE) || event.dataTransfer?.getData('text/plain'))
  if (!payload) return
  if (payload.kind === 'stored-state') emit('assign-slot', { rowIndex, slotIndex, stateIndex: payload.index })
  else if (payload.rowIndex !== undefined && (payload.rowIndex !== rowIndex || payload.index !== slotIndex)) {
    emit('move-slot', { fromRowIndex: payload.rowIndex, fromIndex: payload.index, toRowIndex: rowIndex, toIndex: slotIndex })
  }
}

function clearSlot(rowIndex: number, slotIndex: number) {
  emit('clear-slot', { rowIndex, slotIndex })
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

.add-row-button {
  justify-self: end;
  border: 1px solid var(--teal);
  border-radius: 4px;
  padding: .35rem .6rem;
  background: var(--teal-deep);
  color: var(--teal-soft);
  font-size: .55rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}

.arrangement-toggle {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: .35rem .6rem;
  background: #1c2a33;
  color: var(--text-muted);
  font-size: .55rem;
  font-weight: 800;
  letter-spacing: .06em;
  cursor: pointer;
}

.arrangement-toggle.active {
  border-color: var(--teal);
  background: var(--teal-deep);
  color: var(--teal-soft);
  box-shadow: 0 0 10px rgba(104, 216, 195, .22);
}

.add-row-button:disabled {
  border-color: var(--line-strong);
  background: var(--bg-control);
  color: var(--text-dim);
  cursor: not-allowed;
  opacity: .65;
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

.rows {
  display: grid;
  gap: .5rem;
}

.arrangement-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: center;
  gap: .6rem;
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
