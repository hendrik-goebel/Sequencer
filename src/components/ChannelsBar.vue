<template>
  <div class="channels">
    <div v-for="(ch, i) in channels" :key="ch.id" class="channel" :class="{selected: i === currentIndex}">
      <button draggable="true" @click="$emit('select', i)" @dragstart="startDrag(i, $event)" @dragover.prevent @drop.prevent="dropOnChannel(i, $event)" class="ch-select" :class="{ active: ch.active }" :style="{ background: ch.active ? ch.color : '' }">
        {{ ch.name }}
      </button>
      <button @click.stop="$emit('toggle', i)" :class="{playing: ch.playing}">{{
          ch.playing ? 'Stop' : 'Start'
        }}
      </button>
      <button @click.stop="$emit('toggle-mute', i)" :class="{muted: ch.muted}">
        {{ ch.muted ? 'Unmute' : 'Mute' }}
      </button>
      <label class="key-control">Key
        <select :value="ch.key" @click.stop @change.stop="$emit('update-key', i, $event.target.value)">
          <option :value="NO_KEY">{{ NO_KEY }}</option>
          <option v-for="key in KEYS" :key="key.name" :value="key.name">{{ key.name }}</option>
        </select>
      </label>
      <label class="midi-channel-control">MIDI channel
        <span><input type="number" :value="ch.midiChannel" min="1" max="16" @click.stop @input.stop="$emit('update-midi-channel', i, +$event.target.value)" /><small>CH</small></span>
      </label>
      <label class="tempo-control">Tempo
        <span><input type="number" :value="ch.bpm" min="20" max="300" @input="$emit('update-bpm', i, +$event.target.value)" /><small>BPM</small></span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { KEYS, NO_KEY } from '../config'

const emit = defineEmits<{
  (event: 'select', index: number): void
  (event: 'copy-channel', sourceIndex: number, targetIndex: number): void
  (event: 'toggle-mute', index: number): void
}>()

defineProps<{ channels: any[], currentIndex: number }>()

function startDrag(index: number, event: DragEvent) {
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function dropOnChannel(targetIndex: number, event: DragEvent) {
  const sourceValue = event.dataTransfer?.getData('text/plain')
  const sourceIndex = sourceValue === undefined || sourceValue === '' ? -1 : Number(sourceValue)
  if (Number.isInteger(sourceIndex) && sourceIndex >= 0) {
    emit('copy-channel', sourceIndex, targetIndex)
  }
}
</script>

<style scoped>
.channels {
  display: flex;
  gap: .6rem;
  align-items: center;
  flex-wrap: wrap;
}

.channel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 5px;
  overflow: hidden;
  transition: border-color .15s, box-shadow .15s, transform .15s;
}

.ch-select, .channel button { border: 0; padding: .6rem .7rem; background: var(--bg-panel); color: var(--text-muted); font-size: .63rem; font-weight: 800; letter-spacing: .06em; cursor: pointer; }
.ch-select {
  min-width: 70px;
  transition: background-color .18s ease, color .18s ease, box-shadow .24s ease, transform .18s ease;
}
.ch-select.active {
  box-shadow: 0 0 12px rgba(201, 79, 94, .42);
  transform: translateY(-1px);
  animation: channel-note-pulse .55s ease-out;
}
.channel button:not(.ch-select) { border-top: 1px solid var(--line); }

.channel.selected .ch-select:not(.active) {
  background: var(--text);
  color: var(--bg-deep) !important;
  font-weight: 800;
}
.channel.selected {
  border-color: var(--line-strong);
  box-shadow: 0 0 10px rgba(104, 216, 195, .18);
}
.channel.selected button:not(.ch-select) { border-top-color: var(--line-strong); }

.channel button.playing {
  background: var(--teal-deep);
  color: var(--teal-soft);
}
.channel button.muted {
  background: var(--coral-deep);
  color: var(--coral-soft);
}

.key-control {
  display: grid;
  gap: .25rem;
  padding: .45rem .55rem .55rem;
  border-top: 1px solid var(--line);
  color: var(--text-dim);
  font-size: .5rem;
  font-weight: 800;
  letter-spacing: .1em;
}
.key-control select {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: 700 .75rem ui-monospace, monospace;
  outline: 0;
}
.key-control select:focus { border-color: var(--teal); }

.tempo-control {
  display: grid;
  gap: .25rem;
  padding: .45rem .55rem .55rem;
  border-top: 1px solid var(--line);
  color: var(--text-dim);
  font-size: .5rem;
  font-weight: 800;
  letter-spacing: .1em;
}
.tempo-control span { display: flex; align-items: center; }
.tempo-control input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: 700 .75rem ui-monospace, monospace;
  outline: 0;
}
.tempo-control input:focus { border-color: var(--teal); }
.tempo-control small { margin-left: .3rem; color: var(--teal); font-size: .5rem; }

.midi-channel-control {
  display: grid;
  gap: .25rem;
  padding: .45rem .55rem .55rem;
  border-top: 1px solid var(--line);
  color: var(--text-dim);
  font-size: .5rem;
  font-weight: 800;
  letter-spacing: .1em;
}
.midi-channel-control span { display: flex; align-items: center; }
.midi-channel-control input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font: 700 .75rem ui-monospace, monospace;
  outline: 0;
}
.midi-channel-control input:focus { border-color: var(--teal); }
.midi-channel-control small { margin-left: .3rem; color: var(--teal); font-size: .5rem; }

@keyframes channel-note-pulse {
  0% { box-shadow: 0 0 0 rgba(201, 79, 94, 0); }
  45% { box-shadow: 0 0 16px rgba(201, 79, 94, .58); }
  100% { box-shadow: 0 0 12px rgba(201, 79, 94, .42); }
}

@media (prefers-reduced-motion: reduce) {
  .ch-select { transition: none; }
  .ch-select.active { animation: none; }
}

</style>
