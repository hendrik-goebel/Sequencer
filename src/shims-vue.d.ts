declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare namespace WebMidi {
  interface MIDIOutput {
    id: string
    name?: string
    manufacturer?: string
    send(data: number[], timestamp?: number): void
  }

  interface MIDIInput {
    id: string
    name?: string
    manufacturer?: string
    onmidimessage: ((event: any) => void) | null
  }

  interface MIDIAccess {
    outputs: Map<string, MIDIOutput>
    inputs: Map<string, MIDIInput>
  }
}
