# Broadcast MIDI protocol

This document specifies the `BroadcastChannel` messages emitted by Web Arpeggiator. Use it to consume MIDI clock and routed notes from another tab.

## Requirements

- The sender and receiver must have the same origin: identical scheme, host, and port.
- The browser must support `BroadcastChannel`.
- Web MIDI permission and Web MIDI API support are not required for this transport.
- A `BroadcastChannel` only delivers messages to other channel instances. A tab does not receive messages that it posts itself.
- This protocol transports MIDI byte arrays and realtime clock statuses; it does not provide a Web MIDI `MIDIInput` or `MIDIOutput` object.

## Channels

| Purpose | Channel name |
| --- | --- |
| Clock and transport | `arpeggiator-midi-clock-v1` |
| Routed note events | `arpeggiator-midi-events-v1` |

Create separate channel instances for the streams that the consumer needs. Do not relay received messages back onto the same channel: that creates duplicate clock or note streams for other tabs.

## Clock and transport messages

Clock messages have this structured-clone payload:

```ts
type ClockMessage = {
  type: 'midi-clock'
  status: 0xf8 | 0xfa | 0xfb | 0xfc
}
```

| Status | MIDI meaning | Consumer action |
| --- | --- | --- |
| `0xf8` | Timing Clock | Advance/measure one of 24 pulses per quarter note. |
| `0xfa` | Start | Reset transport position as appropriate and begin playback. |
| `0xfb` | Continue | Resume playback without requiring a position reset. |
| `0xfc` | Stop | Stop playback. |

The sender emits 24 `0xf8` messages per quarter note while its global playback runs. Messages contain no timestamp. Treat delivery time in the receiving tab (`performance.now()`) as the event time; do not try to queue them against a sender clock. Delivery timing is subject to browser scheduling and should be smoothed before deriving tempo.

## Routed note messages

Routed note messages have this structured-clone payload:

```ts
type MidiMessage = {
  type: 'midi-message'
  data: number[]
}
```

`data` contains unsigned MIDI bytes. The current sender emits:

- Note on: `[0x90 + channel, note, velocity]`
- Note off: `[0x80 + channel, note, 0]`

`channel` is zero-based (`0` through `15`); `note` and `velocity` are in `0` through `127`. A receiver should also treat a Note On with velocity `0` as a Note Off, per MIDI convention. The source schedules delivery locally before posting, so note messages should be handled immediately when received. There is no timestamp, sequencing number, or acknowledgement.

When the source clears or changes the BroadcastChannel routing output, it cancels unsent note events and posts Note Off messages for notes it has already sent. Consumers should still clear all active notes if their channel closes, their document becomes inactive, or a transport Stop requires it.

## Minimal receiver

```js
const clockChannel = new BroadcastChannel('arpeggiator-midi-clock-v1');
const notesChannel = new BroadcastChannel('arpeggiator-midi-events-v1');

clockChannel.onmessage = ({ data }) => {
  if (data?.type !== 'midi-clock' || ![0xf8, 0xfa, 0xfb, 0xfc].includes(data.status)) return;

  const receivedAt = performance.now();
  if (data.status === 0xf8) handleClockPulse(receivedAt);
  if (data.status === 0xfa) handleStart();
  if (data.status === 0xfb) handleContinue();
  if (data.status === 0xfc) handleStop();
};

notesChannel.onmessage = ({ data }) => {
  if (data?.type !== 'midi-message' || !Array.isArray(data.data)) return;
  if (data.data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) return;

  handleMidiBytes(data.data);
};

window.addEventListener('pagehide', () => {
  clockChannel.close();
  notesChannel.close();
});
```

Validate every received message before acting on it. Same-origin documents are not necessarily trusted application instances, and other tabs can publish arbitrary data to a known channel name.
