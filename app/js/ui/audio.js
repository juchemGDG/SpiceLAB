// Ton des aktiven Summers (Web Audio). Browser erlauben Ton erst nach einer Bedienung durch die Person –
// der Ton-Schalter in der Menüleiste ist diese Bedienung. Läuft nur, solange ein Summer tönt und der Ton an ist.

const FREQUENCY = 2700; // Hz, typische Resonanz kleiner Piezosummer
let audio = null;
let node = null;

/** Ton an oder aus (idempotent). */
export function setBuzzerTone(on) {
  if (!on) {
    node?.stop();
    node = null;
    return;
  }
  if (node) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = FREQUENCY;
    gain.gain.value = 0.03; // leise
    osc.connect(gain).connect(audio.destination);
    osc.start();
    node = { stop: () => { osc.stop(); osc.disconnect(); gain.disconnect(); } };
  } catch {
    node = null; // kein Audio verfügbar: Simulation läuft trotzdem
  }
}
