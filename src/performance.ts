// Route every soundboard button to both the speakers and one recording bus.
// No microphone permission or screen-sharing permission is needed.
export class PerformanceMixer {
  private context?: AudioContext;
  private bus?: MediaStreamAudioDestinationNode;
  private clock?: ConstantSourceNode;
  private routes = new Map<
    HTMLAudioElement,
    { source: MediaElementAudioSourceNode; gain: GainNode }
  >();
  private initialize() {
    if (!this.context) {
      const Context =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Context)
        throw new Error(
          "This browser does not support soundboard performance recording.",
        );
      this.context = new Context();
      this.bus = this.context.createMediaStreamDestination();
    }
    return this.context;
  }
  async resume() {
    const context = this.initialize();
    await context.resume();
  }
  route(audio: HTMLAudioElement, volume: number) {
    const context = this.initialize();
    let route = this.routes.get(audio);
    if (!route) {
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      gain.connect(this.bus!);
      route = { source, gain };
      this.routes.set(audio, route);
    }
    audio.volume = 1;
    route.gain.gain.value = volume;
    void context.resume().catch(() => {});
  }
  remove(audio: HTMLAudioElement) {
    const route = this.routes.get(audio);
    route?.source.disconnect();
    route?.gain.disconnect();
    this.routes.delete(audio);
  }
  async recordingStream() {
    await this.resume();
    // Keep silent frames flowing before the first button and between sounds.
    this.clock = this.context!.createConstantSource();
    this.clock.offset.value = 0;
    this.clock.connect(this.bus!);
    this.clock.start();
    return this.bus!.stream;
  }
  endRecording() {
    this.clock?.stop();
    this.clock?.disconnect();
    this.clock = undefined;
  }
  close() {
    this.routes.forEach(({ source, gain }) => {
      source.disconnect();
      gain.disconnect();
    });
    this.routes.clear();
    this.endRecording();
    void this.context?.close();
  }
}
export type PerformanceTake = {
  name: string;
  blob: Blob;
  duration: number;
  speed: number;
};
export const speeds = [0.5, 1, 1.5, 2, 4];
