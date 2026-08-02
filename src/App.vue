<template>
  <main class="instrument">

    <section class="global-controls module">
      <div class="module-heading">
        <h2> </h2>
      </div>
      <div class="master-control">
        <label>GLOBAL TEMPO
          <span class="input-wrap"><input type="number" :value="globalBpm" @input="(e)=> setGlobalBpm(+e.target.value)" min="20" max="300" /><small>BPM</small></span>
        </label>
        <button class="master-play" @click="toggleGlobalPlay">{{ globalPlaying ? 'Stop All' : 'Start All' }}</button>
        <button class="master-mute" @click="toggleMuteAll">{{ allMuted ? 'Unmute All' : 'Mute All' }}</button>
        <label class="global-key-control">GLOBAL KEY
          <select :value="globalKey" @change="updateGlobalKey($event.target.value)">
            <option v-for="key in KEYS" :key="key.name" :value="key.name">{{ key.name }}</option>
          </select>
        </label>
        <button class="global-variation" @click="createGlobalVariation">Var all</button>
      </div>
    </section>


    <section class="module channel-module">
      <ChannelsBar :channels="channels" :currentIndex="currentIndex" @select="selectChannel" @copy-channel="copyChannel" @toggle="toggleChannelPlay" @toggle-mute="toggleMute" @update-key="updateChannelKey" @update-midi-channel="updateMidiChannel" @update-bpm="updateChannelBpm" />
    </section>


    <ArpeggiatorPanel :channel="currentChannel" :global-actions="globalActions" :log="log"
      :stored-states="currentStoredStates"
      :active-stored-state-index="currentActiveStoredStateIndex"
      :arrangement-slots="currentChannel.arrangementSlots"
      :active-arrangement-slot-index="currentChannel.arrangementIndex"
      @toggle-tone-material="toggleToneMaterial" @cycle-step="cycleStep" @update-velocity="updateVelocity" @toggle-play="togglePlay" @enable-midi="enableMidi"
      @update-pattern="updatePattern" @update-noteLength="updateNoteLength" @update-octave="updateArpeggioOctave" @clear-notes="clearNotes" @update-loop-length="updateLoopLength" @update-quant="updateQuantisation"
      @update-arpeggio-length="updateArpeggioLength" @channel-variation="handleVariation" @shift-notes="handleShiftNotes" @toggle-global-actions="globalActions = !globalActions"
      @toggle-microtones="toggleMicrotones" @toggle-reduce-notes="toggleReduceNotes"
      @store-state="handleStoreState" @apply-stored-state="handleApplyStoredState"
      @arrangement-assign-slot="handleArrangementAssignSlot"
      @arrangement-move-slot="handleArrangementMoveSlot"
      @arrangement-clear-slot="handleArrangementClearSlot"
      @toggle-playback-mode="handleTogglePlaybackMode"
      />

    <OutputRoutingPanel :outputs="outputs" :selected-output-id="selectedOutputId" @select-output="(id) => { selectedOutputId = id }" />

    <MidiClockPanel :clock-outputs="clockOutputs" :clock-inputs="clockInputs" :clock-output-id="clockOutputId" :clock-input-id="clockInputId"
      @set-clock-output="setClockOutput" @set-clock-input="setClockInput" />

    <section class="seed-panel module">
      <h2>SEED</h2>
      <textarea v-model="seedKey" aria-label="Seed key" placeholder="Generate a seed key or paste one here"></textarea>
      <div class="seed-actions">
        <button class="seed-generate" @click="seedKey = createSeed(); seedStatus = 'Seed generated'">Generate</button>
        <button class="seed-load" @click="seedStatus = loadSeed(seedKey) ?? 'Seed loaded'">Load</button>
        <span v-if="seedStatus" class="seed-status">{{ seedStatus }}</span>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ChannelsBar from './components/ChannelsBar.vue'
import ArpeggiatorPanel from './components/ArpeggiatorPanel.vue'
import MidiClockPanel from './components/MidiClockPanel.vue'
import OutputRoutingPanel from './components/OutputRoutingPanel.vue'
import { useChannels } from './useChannels'
import { KEYS } from './config'
import { useKeyboard } from './useKeyboard'

const {
  channels,
  currentIndex,
  currentChannel,
  allMuted,
  globalBpm,
  globalKey,
  globalPlaying,
  setGlobalBpm,
  updateGlobalKey,
  toggleGlobalPlay,
  createGlobalVariation,
  selectChannel,
  toggleChannelPlay,
  toggleMute,
  toggleMuteAll,
  createVariation: createVariationForChannel,
  updateMidiChannel,
  togglePlay,
  toggleToneMaterial,
  toggleMicrotones,
  toggleReduceNotes,
  cycleStep,
  updateVelocity,
  clearNotes,
  playKeyboardNote,
  outputs,
  selectedOutputId,
  clockOutputs,
  clockInputs,
  clockOutputId,
  clockInputId,
  setClockOutput,
  setClockInput,
  enableMidi,
  log,
  updateChannelBpm,
  updatePattern,
  updateChannelKey,
  updateNoteLength,
  updateLoopLength,
  updateArpeggioLength,
  updateQuantisation,
  updateArpeggioOctave,
  shiftCurrentChannelNotes: shiftCurrentChannelNotesForChannel,
  shiftAllChannelNotes,
  currentStoredStates,
  currentActiveStoredStateIndex,
  storeCurrentState,
  applyStoredState,
  storeAllStates,
  applyAllStoredStates,
  setArrangementSlot,
  moveArrangementSlot,
  clearArrangementSlot,
  setPlaybackMode,
  createSeed,
  loadSeed,
  copyChannel
} = useChannels()

const seedKey = ref('')
const seedStatus = ref('')
const globalActions = ref(false)

function handleVariation() {
  if (globalActions.value) createGlobalVariation()
  else createVariationForChannel(currentIndex.value)
}

function handleShiftNotes(direction: 1 | -1) {
  if (globalActions.value) shiftAllChannelNotes(direction)
  else shiftCurrentChannelNotesForChannel(direction)
}

function handleStoreState() {
  if (globalActions.value) storeAllStates()
  else storeCurrentState()
}

function handleApplyStoredState(index: number) {
  if (globalActions.value) applyAllStoredStates(index)
  else applyStoredState(index)
}

function handleArrangementAssignSlot(payload: { slotIndex: number, stateIndex: number }) {
  if (globalActions.value) channels.forEach((_, index) => setArrangementSlot(index, payload.slotIndex, payload.stateIndex))
  else setArrangementSlot(currentIndex.value, payload.slotIndex, payload.stateIndex)
}

function handleArrangementMoveSlot(payload: { fromIndex: number, toIndex: number }) {
  if (globalActions.value) channels.forEach((_, index) => moveArrangementSlot(index, payload.fromIndex, payload.toIndex))
  else moveArrangementSlot(currentIndex.value, payload.fromIndex, payload.toIndex)
}

function handleArrangementClearSlot(slotIndex: number) {
  if (globalActions.value) channels.forEach((_, index) => clearArrangementSlot(index, slotIndex))
  else clearArrangementSlot(currentIndex.value, slotIndex)
}

function handleTogglePlaybackMode() {
  const nextMode = currentChannel.value.playbackMode === 'arrangement' ? 'state' : 'arrangement'
  if (globalActions.value) channels.forEach((_, index) => setPlaybackMode(index, nextMode))
  else setPlaybackMode(currentIndex.value, nextMode)
  if (nextMode === 'arrangement' && !currentChannel.value.playing) togglePlay()
}

useKeyboard({
  currentIndex,
  channelCount: channels.length,
  selectChannel,
  toggleMute,
  toggleMuteAll,
  togglePlay,
  createVariation: handleVariation,
  createGlobalVariation,
  shiftCurrentChannelNotes: handleShiftNotes,
  playKeyboardNote
})
onMounted(() => {
  void enableMidi().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    log.value.unshift(`${new Date().toISOString()} MIDI unavailable: ${message}`)
  })
})
</script>

<style scoped>
.instrument {
  width: 862px;
  margin: 2rem auto;
  color: var(--text);
}

.instrument-header, .module-heading, .master-control {
  display: flex;
  align-items: center;
}

.instrument-header {
  justify-content: space-between;
  margin: 0 0 1.25rem;
  padding: 0 .25rem;
}

.eyebrow, h1, h2 { margin: 0; }
.eyebrow { color: var(--text-dim); font-size: .65rem; font-weight: 800; letter-spacing: .18em; }
h1 { margin-top: .2rem; color: #f3fbff; font-size: clamp(1.7rem, 4vw, 2.5rem); letter-spacing: .08em; }
h1 span { color: var(--teal); font-weight: 400; }
.status-light { color: var(--text-muted); font-size: .65rem; font-weight: 700; letter-spacing: .12em; }
.status-light i { display: inline-block; width: .5rem; height: .5rem; margin-right: .4rem; border-radius: 50%; background: var(--teal); box-shadow: 0 0 12px var(--teal); }

.module {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: linear-gradient(145deg, var(--bg-raised), var(--bg-panel));
  box-shadow: 0 18px 40px rgba(0, 0, 0, .22), inset 0 1px rgba(255, 255, 255, .035);
}

.channel-module { padding: 1rem; margin-bottom: 1rem; }
.module-heading { gap: .7rem; margin-bottom: .85rem; }
.module-index { color: var(--teal); font-family: monospace; font-size: .7rem; }
h2 { color: var(--text-muted); font-size: .7rem; letter-spacing: .16em; }

.global-controls {
  display: flex;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}
.global-controls .module-heading { margin: 0; }
.master-control { gap: 1.2rem; }
.master-control label { color: var(--text-muted); font-size: .62rem; font-weight: 800; letter-spacing: .13em; }
.input-wrap { display: flex; align-items: center; margin-top: .3rem; }
:global(input[type="number"]::-webkit-inner-spin-button) {
  width: 1.25rem;
  height: 1.75rem;
}
.master-control input {
  width: 4rem; padding: .35rem .1rem; border: 0; border-bottom: 1px solid var(--line-strong);
  background: transparent; color: #f3fbff; font: 700 1.1rem ui-monospace, monospace; outline: 0;
}
.master-control small { margin-left: .4rem; color: var(--teal); font-size: .58rem; }
.master-play {
  border: 1px solid var(--teal); border-radius: 5px; padding: .7rem 1rem; background: var(--teal-deep);
  color: var(--teal-soft); font-size: .65rem; font-weight: 800; letter-spacing: .1em; cursor: pointer;
}
.master-mute {
  border: 1px solid var(--coral); border-radius: 5px; padding: .7rem 1rem; background: var(--coral-deep);
  color: var(--coral-soft); font-size: .65rem; font-weight: 800; letter-spacing: .1em; cursor: pointer;
}
.global-key-control { display: grid; gap: .3rem; color: var(--text-muted); font-size: .55rem; font-weight: 800; letter-spacing: .1em; }
.global-key-control select { width: 5rem; border: 1px solid var(--line-strong); border-radius: 4px; padding: .35rem; background: var(--bg-control); color: var(--text); font: 600 .65rem ui-monospace, monospace; }
.global-variation {
  align-self: end; border: 1px solid var(--lavender); border-radius: 4px; padding: .45rem .8rem;
  background: var(--lavender-deep); color: var(--lavender-soft); font-size: .62rem; font-weight: 800;
  letter-spacing: .08em; cursor: pointer;
}
.clock-control { display: grid; gap: .3rem; color: var(--text-muted); font-size: .55rem; font-weight: 800; letter-spacing: .1em; }
.clock-control select { max-width: 10rem; border: 1px solid var(--line-strong); border-radius: 4px; padding: .35rem; background: var(--bg-control); color: var(--text); font-size: .65rem; }
.master-stop {
  border: 1px solid var(--coral); border-radius: 5px; padding: .7rem 1rem; background: var(--coral-deep);
  color: var(--coral-soft); font-size: .65rem; font-weight: 800; letter-spacing: .1em; cursor: pointer;
}
.seed-panel { margin-top: 1rem; padding: 1rem 1.25rem; }
.seed-panel h2 { margin-bottom: .7rem; color: var(--teal); }
.seed-panel textarea {
  display: block; width: 100%; min-height: 4rem; resize: vertical;
  border: 1px solid var(--line-strong); border-radius: 4px; padding: .6rem;
  background: var(--bg-control); color: var(--text); font: .7rem ui-monospace, monospace;
}
.seed-panel textarea:focus { border-color: var(--teal); outline: none; box-shadow: 0 0 0 2px rgba(104, 216, 195, .12); }
.seed-actions { display: flex; align-items: center; gap: .6rem; margin-top: .7rem; }
.seed-actions button {
  border: 1px solid var(--line-strong); border-radius: 4px; padding: .5rem .8rem;
  color: var(--text); background: var(--bg-raised); font-size: .62rem; font-weight: 800;
  letter-spacing: .08em; cursor: pointer;
}
.seed-actions .seed-generate { border-color: var(--teal); color: var(--teal-soft); background: var(--teal-deep); }
.seed-actions .seed-load { border-color: var(--lavender); color: var(--lavender-soft); background: var(--lavender-deep); }
.seed-status { color: var(--text-muted); font-size: .62rem; }
@media (max-width: 650px) {
  .instrument { margin-top: 1rem; }
  .instrument-header, .global-controls { align-items: flex-start; flex-direction: column; gap: 1rem; }
  .global-controls { padding: 1rem; }
  .seed-actions { align-items: flex-start; flex-direction: column; }
}
</style>
