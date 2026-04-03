/**
 * AudioManager — synthesized SFX using the Web Audio API.
 *
 * No audio files required. All sounds are generated procedurally from
 * oscillators and gain envelopes.
 *
 * Web Audio requires a user gesture before the AudioContext can resume.
 * Call resume() on the first user interaction (tap / keydown).
 *
 * Usage:
 *   const audio = new AudioManager();
 *   audio.resume();           // call from first input handler
 *   audio.playPerfect();
 *   audio.playGood();
 *   audio.playMiss();
 */

// ─── Tone parameters ──────────────────────────────────────────────────────────

/** Perfect: bright ascending two-note chime */
const PERFECT_FREQS  = [880, 1320] as const;
const PERFECT_DURATION = 0.12; // seconds per note
const PERFECT_GAIN     = 0.18;

/** Good: single mid-range ping */
const GOOD_FREQ     = 660;
const GOOD_DURATION = 0.10;
const GOOD_GAIN     = 0.14;

/** Miss: short low thud with fast decay */
const MISS_FREQ     = 130;
const MISS_DURATION = 0.18;
const MISS_GAIN     = 0.22;

/** Level-up: ascending 3-note fanfare */
const LEVEL_UP_FREQS    = [440, 550, 660] as const;
const LEVEL_UP_DURATION = 0.10; // seconds per note
const LEVEL_UP_GAIN     = 0.14;

/** Volume for the background music track (0–1) */
const MUSIC_VOLUME = 0.5;

// ─── AudioManager ─────────────────────────────────────────────────────────────

export class AudioManager {
  readonly #ctx: AudioContext;
  readonly #music: HTMLAudioElement;

  constructor() {
    this.#ctx = new AudioContext();

    this.#music = new Audio('/assets/audio/Orbiting_The_Burning_Core.mp3');
    this.#music.loop   = true;
    this.#music.volume = MUSIC_VOLUME;
  }

  /**
   * Resume the AudioContext after a user gesture.
   * Also starts the background music track if it isn't already playing.
   * Safe to call multiple times.
   */
  resume(): void {
    if (this.#ctx.state === 'suspended') {
      void this.#ctx.resume();
    }
    if (this.#music.paused) {
      void this.#music.play();
    }
  }

  /** Pause the background music (e.g. on score screen). */
  pauseMusic(): void {
    this.#music.pause();
  }

  /** Resume the background music. */
  resumeMusic(): void {
    void this.#music.play();
  }

  playPerfect(): void {
    const now = this.#ctx.currentTime;
    PERFECT_FREQS.forEach((freq, i) => {
      this.#playTone(freq, 'sine', PERFECT_GAIN, now + i * PERFECT_DURATION, PERFECT_DURATION);
    });
  }

  playGood(): void {
    this.#playTone(GOOD_FREQ, 'sine', GOOD_GAIN, this.#ctx.currentTime, GOOD_DURATION);
  }

  playMiss(): void {
    this.#playTone(MISS_FREQ, 'sawtooth', MISS_GAIN, this.#ctx.currentTime, MISS_DURATION);
  }

  playLevelUp(): void {
    const now = this.#ctx.currentTime;
    LEVEL_UP_FREQS.forEach((freq, i) => {
      this.#playTone(freq, 'sine', LEVEL_UP_GAIN, now + i * LEVEL_UP_DURATION, LEVEL_UP_DURATION);
    });
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Schedules a single tone: oscillator → gain envelope → destination.
   * The gain ramps from peak to 0 over the duration (percussive shape).
   */
  #playTone(
    freq: number,
    type: OscillatorType,
    peakGain: number,
    startTime: number,
    duration: number,
  ): void {
    const osc  = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();

    osc.type            = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.#ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);

    // Disconnect after playback to allow GC
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
