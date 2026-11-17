import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT_DIR = resolve(ROOT, "out");
const OUT_WAV = resolve(OUT_DIR, "gridline-audio.wav");

const SAMPLE_RATE = 48000;
const DURATION_SEC = 50.0;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function softLimit(x: number): number {
  return Math.tanh(x);
}

interface ChordSection {
  start: number;
  end: number;
  bassMidi: number;
  voicesMidi: number[];
}

// D minor 9 -> Bb major 7 -> F major 9 -> C add9 -> Dm9 resolve
const CHORDS: ChordSection[] = [
  { start: 0.0, end: 13.0, bassMidi: 38, voicesMidi: [50, 57, 60, 64, 69] }, // Dm9
  { start: 13.0, end: 25.0, bassMidi: 34, voicesMidi: [46, 53, 57, 62, 65] }, // Bbmaj7
  { start: 25.0, end: 37.0, bassMidi: 41, voicesMidi: [53, 57, 60, 64, 67] }, // Fmaj9
  { start: 37.0, end: 44.0, bassMidi: 36, voicesMidi: [48, 55, 60, 62, 67] }, // Cadd9
  { start: 44.0, end: 50.0, bassMidi: 38, voicesMidi: [50, 57, 62, 64, 69] }, // Dm9 resolve
];

function addSubDrop(
  left: Float64Array,
  right: Float64Array,
  startSec: number,
  durationSec: number,
  f0: number,
  f1: number,
  amp: number,
): void {
  const startIdx = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(durationSec * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < len && startIdx + i < TOTAL_SAMPLES; i++) {
    const u = i / len;
    const freq = f0 + (f1 - f0) * Math.pow(u, 0.55);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = smoothstep(0, 0.04, u) * Math.exp(-3.6 * u);
    const val = (Math.sin(phase) * 0.85 + Math.sin(phase * 2) * 0.15) * env * amp;
    left[startIdx + i] += val;
    right[startIdx + i] += val;
  }
}

function addUiClick(
  left: Float64Array,
  right: Float64Array,
  startSec: number,
  pan: number,
  amp = 0.22,
): void {
  const startIdx = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(0.032 * SAMPLE_RATE);
  const lGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rGain = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < len && startIdx + i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 175);
    const tone =
      Math.sin(2 * Math.PI * 1950 * t) * 0.55 +
      Math.sin(2 * Math.PI * 3400 * t) * 0.3 +
      Math.sin(2 * Math.PI * 720 * t) * 0.15;
    const v = tone * env * amp;
    left[startIdx + i] += v * lGain;
    right[startIdx + i] += v * rGain;
  }
}

function addTelemetryChime(
  left: Float64Array,
  right: Float64Array,
  startSec: number,
): void {
  const notes = [
    { offset: 0.0, freq: 880.0, pan: -0.25 },
    { offset: 0.11, freq: 1318.51, pan: 0.25 },
    { offset: 0.24, freq: 1760.0, pan: 0.0 },
  ];
  for (const n of notes) {
    const sIdx = Math.floor((startSec + n.offset) * SAMPLE_RATE);
    const len = Math.floor(1.4 * SAMPLE_RATE);
    const lGain = Math.cos(((n.pan + 1) * Math.PI) / 4);
    const rGain = Math.sin(((n.pan + 1) * Math.PI) / 4);
    for (let i = 0; i < len && sIdx + i < TOTAL_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = smoothstep(0, 0.008, t) * Math.exp(-3.1 * t);
      const val =
        (Math.sin(2 * Math.PI * n.freq * t) * 0.8 +
          Math.sin(2 * Math.PI * n.freq * 2 * t) * 0.15) *
        env *
        0.15;
      left[sIdx + i] += val * lGain;
      right[sIdx + i] += val * rGain;
    }
  }
}

function generate(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const left = new Float64Array(TOTAL_SAMPLES);
  const right = new Float64Array(TOTAL_SAMPLES);

  // Harmonic pad + stereo shimmer + 112 BPM pulse
  const beatSec = 60 / 112;
  const sixteenthSec = beatSec / 4;

  // Track phase continuity across voices
  const voicePhasesL = new Float64Array(10);
  const voicePhasesR = new Float64Array(10);
  let bassPhase = 0;
  let arpPhase = 0;

  // Low-pass one-pole state for smooth warm pad
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;

    // Master envelope: 0.4s fade in, clean cosine fade out 47.0s -> 50.0s
    const fadeIn = smoothstep(0.0, 0.45, t);
    const fadeOut = 1.0 - smoothstep(47.0, 49.92, t);
    const masterEnv = fadeIn * fadeOut;

    // Interpolate chord weight cleanly across crossfades
    let padL = 0;
    let padR = 0;
    let currentBassHz = midiToHz(38);
    let currentArpNotes = CHORDS[0].voicesMidi;

    for (let cIdx = 0; cIdx < CHORDS.length; cIdx++) {
      const c = CHORDS[cIdx];
      const wIn = smoothstep(c.start - 0.6, c.start + 0.6, t);
      const wOut = 1.0 - smoothstep(c.end - 0.6, c.end + 0.6, t);
      const w = cIdx === 0 ? wOut : cIdx === CHORDS.length - 1 ? wIn : wIn * wOut;
      if (w <= 0.0001) continue;

      if (t >= c.start && t < c.end) {
        currentBassHz = midiToHz(c.bassMidi);
        currentArpNotes = c.voicesMidi;
      }

      for (let v = 0; v < c.voicesMidi.length; v++) {
        const hz = midiToHz(c.voicesMidi[v]);
        const detune = (v % 2 === 0 ? 1 : -1) * 0.0028;
        const pIdx = v;
        voicePhasesL[pIdx] += (2 * Math.PI * hz * (1 + detune)) / SAMPLE_RATE;
        voicePhasesR[pIdx] += (2 * Math.PI * hz * (1 - detune)) / SAMPLE_RATE;

        // Soft warm waveform (fundamental + damped 2nd & 3rd harmonics)
        const sL =
          Math.sin(voicePhasesL[pIdx]) * 0.68 +
          Math.sin(voicePhasesL[pIdx] * 2) * 0.22 +
          Math.sin(voicePhasesL[pIdx] * 3) * 0.08;
        const sR =
          Math.sin(voicePhasesR[pIdx]) * 0.68 +
          Math.sin(voicePhasesR[pIdx] * 2) * 0.22 +
          Math.sin(voicePhasesR[pIdx] * 3) * 0.08;

        const pan = (v / (c.voicesMidi.length - 1) - 0.5) * 0.7;
        const gL = Math.cos(((pan + 1) * Math.PI) / 4);
        const gR = Math.sin(((pan + 1) * Math.PI) / 4);

        padL += (sL * gL + sR * gL * 0.25) * w * 0.085;
        padR += (sR * gR + sL * gR * 0.25) * w * 0.085;
      }
    }

    // Gentle low-pass sweep opening during build
    const cutoffNorm = 0.045 + 0.045 * smoothstep(2.0, 26.0, t) * (1 - 0.4 * smoothstep(43.0, 49.0, t));
    lpL += cutoffNorm * (padL - lpL);
    lpR += cutoffNorm * (padR - lpR);

    // Subtle 112 BPM pulse (6.5s -> 44.0s)
    const pulseActive = smoothstep(6.2, 7.2, t) * (1.0 - smoothstep(43.5, 45.2, t));
    let bassSample = 0;
    let arpSampleL = 0;
    let arpSampleR = 0;

    if (pulseActive > 0.001) {
      const stepFloat = t / sixteenthSec;
      const stepIdx = Math.floor(stepFloat);
      const stepFrac = stepFloat - stepIdx;

      // Clean muted octave bass pulse on 8ths
      const eighthPhase = (t / (sixteenthSec * 2)) % 1;
      const bassEnv = Math.exp(-5.2 * eighthPhase) * smoothstep(0, 0.025, eighthPhase);
      bassPhase += (2 * Math.PI * currentBassHz) / SAMPLE_RATE;
      bassSample =
        (Math.sin(bassPhase) * 0.8 + Math.sin(bassPhase * 2) * 0.2) *
        bassEnv *
        pulseActive *
        0.16;

      // Delicate crystalline 16th-note pulse arpeggio
      const arpNoteMidi = currentArpNotes[stepIdx % currentArpNotes.length] + 12;
      const arpHz = midiToHz(arpNoteMidi);
      arpPhase += (2 * Math.PI * arpHz) / SAMPLE_RATE;
      const accent = stepIdx % 4 === 0 ? 1.0 : stepIdx % 2 === 0 ? 0.65 : 0.42;
      const arpEnv = Math.exp(-8.5 * stepFrac) * smoothstep(0, 0.03, stepFrac);
      const rawArp = Math.sin(arpPhase) * arpEnv * accent * pulseActive * 0.055;
      const arpPan = Math.sin(stepIdx * 0.7) * 0.45;
      arpSampleL = rawArp * Math.cos(((arpPan + 1) * Math.PI) / 4);
      arpSampleR = rawArp * Math.sin(((arpPan + 1) * Math.PI) / 4);
    }

    left[i] = (lpL + bassSample + arpSampleL) * masterEnv;
    right[i] = (lpR + bassSample + arpSampleR) * masterEnv;
  }

  // Frame-synced cinematic hits & UI micro-cues
  addSubDrop(left, right, 0.22, 1.8, 68, 34, 0.34); // Scene 1 ISO Grid Ignition
  addSubDrop(left, right, 6.48, 1.2, 58, 36, 0.22); // Scene 2 Command view entry
  addUiClick(left, right, 14.6, 0.25, 0.24); // Scene 3 Click Light + Water Lens
  addUiClick(left, right, 17.5, -0.45, 0.24); // Scene 3 Click Undisclosed Water
  addUiClick(left, right, 21.1, -0.35, 0.2); // Scene 4 Select Equinix Ashburn
  addUiClick(left, right, 23.4, 0.35, 0.25); // Scene 4 Click Inspect Parcel
  addSubDrop(left, right, 23.42, 1.5, 64, 34, 0.32); // Scene 4 z16 Satellite dive
  addTelemetryChime(left, right, 29.4); // Scene 5 Live NOAA/USGS Telemetry lock
  addUiClick(left, right, 37.9, 0.0, 0.22); // Scene 6 Comparison / CLI cue
  addSubDrop(left, right, 44.0, 2.0, 56, 32, 0.28); // Scene 7 Launch End Slate resolve

  // Peak normalize to -2.0 dBFS with soft limiting safety
  let peak = 0;
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    left[i] = softLimit(left[i]);
    right[i] = softLimit(right[i]);
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const targetPeak = Math.pow(10, -2.0 / 20); // ~0.794
  const norm = peak > 0 ? targetPeak / peak : 1;

  // Write 48kHz 16-bit Stereo PCM WAV
  const dataBytes = TOTAL_SAMPLES * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(2, 22); // Stereo
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 4, 28); // byte rate
  buf.writeUInt16LE(4, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const lSample = Math.round(clamp(left[i] * norm, -1, 1) * 32767);
    const rSample = Math.round(clamp(right[i] * norm, -1, 1) * 32767);
    buf.writeInt16LE(lSample, 44 + i * 4);
    buf.writeInt16LE(rSample, 46 + i * 4);
  }

  writeFileSync(OUT_WAV, buf);
  console.log(
    `Synthesized 48kHz stereo soundtrack -> ${OUT_WAV} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${DURATION_SEC}s)`,
  );
}

generate();
