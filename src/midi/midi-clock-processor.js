class MidiClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = sampleRate; // provided by the worklet global scope
    this.beatsPerMinute = 120;
    this.samplesPerClockTick = this.sampleRate * 60 / this.beatsPerMinute;
    this.samplesRemainingUntilNextTick = this.samplesPerClockTick;
    this.isRunning = false;
    this.pendingBeatsPerMinute = null;
    this.tickScheduled = false;
    this.scheduleAheadSamples = Math.floor(this.sampleRate * 0.1);

    this.port.onmessage = (event) => {
      const data = event.data;
      switch (data && data.type) {
        case 'init':
          this.sampleRate = data.sampleRate || this.sampleRate;
          // allow main thread to provide default BPM from config
          if (typeof data.bpm === 'number') this.beatsPerMinute = data.bpm;
          if (typeof data.scheduleAheadSamples === 'number') {
            this.scheduleAheadSamples = Math.max(0, Math.floor(data.scheduleAheadSamples));
          }
          break;
        case 'setBpm':
          this.pendingBeatsPerMinute = data.bpm;
          break;
        case 'start':
          this.isRunning = true;
          this.samplesPerClockTick = this.sampleRate * 60 / (data.bpm || this.beatsPerMinute);
          this.samplesRemainingUntilNextTick = (typeof data.startInSamples === 'number') ? data.startInSamples : this.samplesPerClockTick;
          this.beatsPerMinute = data.bpm || this.beatsPerMinute;
          this.pendingBeatsPerMinute = null;
          this.tickScheduled = false;
          break;
        case 'stop':
          this.isRunning = false;
          this.tickScheduled = false;
          break;
        default:
          break;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const framesAvailable = (outputs && outputs[0] && outputs[0][0]) ? outputs[0][0].length : 128;
    if (!this.isRunning) return true;
    for (let frameIndex = 0; frameIndex < framesAvailable; frameIndex++) {
      if (!this.tickScheduled && this.samplesRemainingUntilNextTick <= this.scheduleAheadSamples) {
        this.tickScheduled = true;
        this.port.postMessage({
          type: 'tick',
          audioTime: (currentFrame + frameIndex + this.samplesRemainingUntilNextTick) / this.sampleRate
        });
      }

      this.samplesRemainingUntilNextTick -= 1;
      if (this.samplesRemainingUntilNextTick > 0) continue;

      // apply pending beats-per-minute change after tick
      if (this.pendingBeatsPerMinute != null) {
        this.beatsPerMinute = this.pendingBeatsPerMinute;
        this.pendingBeatsPerMinute = null;
      }
      this.samplesPerClockTick = this.sampleRate * 60 / this.beatsPerMinute;
      this.samplesRemainingUntilNextTick += this.samplesPerClockTick;
      this.tickScheduled = false;
    }
    return true;
  }
}

registerProcessor('midi-clock-processor', MidiClockProcessor);
