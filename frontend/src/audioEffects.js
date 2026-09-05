// Web Audio API ambient orbital drone & sci-fi UI audio synthesizer

let audioCtx = null;
let masterGain = null;
let droneOsc1 = null;
let droneOsc2 = null;
let lfoOsc = null;
let isPlaying = false;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = new AudioContextClass();

  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
  masterGain.connect(audioCtx.destination);
}

export function startAmbientAudio() {
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    if (isPlaying) return;

    // Filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, audioCtx.currentTime);
    filter.Q.setValueAtTime(2.5, audioCtx.currentTime);
    filter.connect(masterGain);

    // Osc 1: Deep cosmic root (C2 ~ 65.4Hz)
    droneOsc1 = audioCtx.createOscillator();
    droneOsc1.type = "sine";
    droneOsc1.frequency.setValueAtTime(65.4, audioCtx.currentTime);

    // Osc 2: Perfect fifth with slight shimmer (G2 ~ 98.1Hz + 0.4Hz detune)
    droneOsc2 = audioCtx.createOscillator();
    droneOsc2.type = "triangle";
    droneOsc2.frequency.setValueAtTime(98.3, audioCtx.currentTime);

    // Sub LFO for gentle orbital breathing
    lfoOsc = audioCtx.createOscillator();
    lfoOsc.type = "sine";
    lfoOsc.frequency.setValueAtTime(0.12, audioCtx.currentTime);
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(70, audioCtx.currentTime);
    lfoOsc.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    droneOsc1.connect(filter);
    droneOsc2.connect(filter);

    droneOsc1.start();
    droneOsc2.start();
    lfoOsc.start();
    isPlaying = true;
  } catch (e) {
    console.warn("Ambient audio error:", e);
  }
}

export function stopAmbientAudio() {
  try {
    if (droneOsc1) {
      droneOsc1.stop();
      droneOsc1.disconnect();
      droneOsc1 = null;
    }
    if (droneOsc2) {
      droneOsc2.stop();
      droneOsc2.disconnect();
      droneOsc2 = null;
    }
    if (lfoOsc) {
      lfoOsc.stop();
      lfoOsc.disconnect();
      lfoOsc = null;
    }
    isPlaying = false;
  } catch (e) {
    console.warn("Stop audio error:", e);
  }
}

export function playUiClick() {
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    // silent
  }
}
