export class CafeAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  buses = new Map<string, GainNode>();
  volumes: Record<string, number> = {
    master: 0.45,
    cafe: 0.2,

    street: 0.12,
    birds: 0.18,
    cards: 0.55,
    announcements: 0.65,
  };
  timers: number[] = [];
  constructor() {
    try {
      Object.assign(
        this.volumes,
        JSON.parse(localStorage.getItem("yaniv-audio") || "{}"),
      );
    } catch {}
  }
  async start() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const ctx = new AudioContext();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(ctx.destination);
    for (const key of ["cafe", "street", "birds", "cards", "announcements"]) {
      const bus = ctx.createGain();
      bus.gain.value = this.volumes[key];
      bus.connect(this.master);
      this.buses.set(key, bus);
    }
    this.noise("street", 180, 0.08);
    this.noise("cafe", 700, 0.06);
    this.timers.push(window.setInterval(() => this.bird(), 7000));
    this.timers.push(
      window.setInterval(() => {
        this.tone("cafe", 1400, 0.045, 0.12);
      }, 4300),
    );
  }
  set(key: string, value: number) {
    this.volumes[key] = value;
    localStorage.setItem("yaniv-audio", JSON.stringify(this.volumes));
    const gain = key === "master" ? this.master : this.buses.get(key);
    if (gain && this.context)
      gain.gain.setTargetAtTime(value, this.context.currentTime, 0.1);
  }
  noise(bus: string, frequency: number, gain: number) {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * gain;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    source.connect(filter).connect(this.buses.get(bus)!);
    source.start();
  }
  tone(bus: string, freq: number, duration: number, volume: number, delay = 0) {
    if (!this.context) return;
    const ctx = this.context;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.75, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.buses.get(bus)!);
    o.start(t);
    o.stop(t + duration + 0.05);
  }
  bird() {
    this.tone("birds", 2100, 0.1, 0.1);
    this.tone("birds", 2900, 0.13, 0.1, 0.18);
    this.tone("birds", 2400, 0.1, 0.08, 0.35);
  }
  speak(text: string, category = "announcements") {
    if (
      !("speechSynthesis" in window) ||
      this.volumes.master * this.volumes[category] < 0.01
    )
      return;
    const voice = speechSynthesis
      .getVoices()
      .find((v) => v.localService && v.lang.startsWith("fr"));
    // Use only an installed local voice; audio must not depend on a remote service.
    if (!voice || speechSynthesis.speaking) return;
    const speech = new SpeechSynthesisUtterance(text);
    speech.voice = voice;
    speech.lang = voice.lang;
    speech.volume = this.volumes.master * this.volumes[category];
    speech.rate = 0.96;
    speechSynthesis.speak(speech);
  }
  event(type: string) {
    if (["play", "draw", "bonus", "deal"].includes(type)) {
      this.tone("cards", type === "draw" ? 470 : 260, 0.08, 0.35);
      this.tone("cards", 1800, 0.025, 0.12, 0.02);
    }
    if (["yaniv", "assaf", "win"].includes(type)) {
      this.speak(
        type === "yaniv"
          ? "Yaniv !"
          : type === "assaf"
            ? "Assaf ! Bien essayé !"
            : "La table a son champion !",
      );
      const notes = type === "assaf" ? [440, 330, 210] : [392, 494, 587, 784];
      notes.forEach((n, i) =>
        this.tone("announcements", n, 0.3, 0.22, i * 0.14),
      );
    }
  }
}
