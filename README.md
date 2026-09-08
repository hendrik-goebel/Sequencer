Web Arpeggiator (Vue 3 + TypeScript)

Quick start:

1. npm install
2. npm run dev
3. Open the app in Chrome/Edge (Web MIDI supported). MIDI is enabled automatically on load; select your output.

MIDI clock output sends standard 24 PPQN realtime clock messages to the selected clock output
while Global Play is running. MIDI clock input measures incoming `0xF8` pulses, updates the
global tempo, and follows incoming Start/Continue/Stop transport messages.

Sequenced note-on and note-off messages are queued with Web MIDI timestamps about 100 ms before
their intended beat, so rendering and timer jitter do not determine their output time. Stop and
output changes clear queued notes. Physical timing still depends on the browser, MIDI driver,
interface, USB transport, and receiving device. The **Timing variation** control remains an
intentional 0–100 ms musical delay. AudioWorklet-capable Chrome or Edge is recommended; other
browsers use a drift-corrected timer fallback.

MIDI Learn (AKAI MIDI Mix ready):
- Open **MIDI LEARN**.
- Select a MIDI input (for AKAI MIDI Mix choose the MIDImix input port).
- Click **Learn** on any global/channel/sequence/velocity/randomization target, then move a knob/fader/button.
- Both CC and Note/Button messages are supported.
- Toggle **Learn on/off** to enable/disable mapped playback control, clear individual mappings or clear all.
- Mappings and selected MIDI Learn input persist in `localStorage`.
- Seed export/import now includes MIDI Learn mappings and selected input.

Notes:
- Web MIDI may still require user permission depending on browser security settings.
- To route MIDI to other apps, use a virtual MIDI port (IAC on macOS, loopMIDI on Windows).
- Keyboard shortcuts: `1`-`8` select a channel, Left/Right select the previous/next channel,
  `M` mutes the current channel, Command+`M` mutes/unmutes all channels, Space toggles
  the current channel, `V` triggers its variation, `L` opens MIDI Learn, and Command+`V` triggers the global variation.
- With Caps Lock active, play the current channel from the German keyboard layout: `A S D F G H J K L` are white keys and `W E R T Z U I O P` are black keys.
- Open **MIDI Learn** and choose **MIDI Mix defaults** for a starting setup using the AKAI MIDI Mix's standard CC assignments. Select the device as the MIDI Learn input first if it is not already selected.
