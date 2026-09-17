export class CafeAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  buses = new Map<string, GainNode>();
  volumes: Record<string, number> = {
    master: 0.45,
    taunts: 0.65,
    cafe: 0.2,

    street: 0.12,
    birds: 0.18,
    cards: 0.55,
    announcements: 0.65,
  };
  timers: number[] = [];
  tauntPlayer: HTMLAudioElement | null = null;
  playTaunt(base64: string) {
    this.tauntPlayer?.pause();
    document.getElementById("taunt-playback")?.remove();
    const box = document.createElement("div");
    box.id = "taunt-playback";
    box.className = "taunt-playback glass";
    const label = document.createElement("span");
    label.textContent = "Vanne · voix générée par IA";
    const player = new Audio(`data:audio/mpeg;base64,${base64}`);
    player.controls = true;
    player.volume = Math.max(
      0,
      Math.min(1, this.volumes.master * this.volumes.taunts),
    );
    this.tauntPlayer = player;
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Arrêter la vanne");
    close.onclick = () => {
      player.pause();
      box.remove();
    };
    box.append(label, player, close);
    document.body.append(box);
    if (player.volume > 0) void player.play().catch(() => {});
  }
  constructor() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
    if (this.tauntPlayer)
      this.tauntPlayer.volume = Math.max(
        0,
        Math.min(1, this.volumes.master * this.volumes.taunts),
      );
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
  event(type: string) {
    if (["play", "draw", "bonus", "deal"].includes(type)) {
      this.tone("cards", type === "draw" ? 470 : 260, 0.08, 0.35);
      this.tone("cards", 1800, 0.025, 0.12, 0.02);
    }
    if (["yaniv", "assaf", "win"].includes(type)) {
      const notes = type === "assaf" ? [440, 330, 210] : [392, 494, 587, 784];
      notes.forEach((n, i) =>
        this.tone("announcements", n, 0.3, 0.22, i * 0.14),
      );
    }
  }
}
