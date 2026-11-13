/**
 * Subtle In-App Notification Ting/Chime Sound System
 * Pure Web Audio API Synthesizer - Lightweight, Zero Network Latency, Zero MP3 Dependencies.
 */

let sharedAudioContext: AudioContext | null = null;
let userHasInteracted = false;

// Passive user-gesture listeners to safely resume AudioContext on browser autoplay lock
if (typeof window !== 'undefined') {
  const handleInteraction = () => {
    userHasInteracted = true;
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
  };

  window.addEventListener('click', handleInteraction, { passive: true, capture: true });
  window.addEventListener('keydown', handleInteraction, { passive: true, capture: true });
  window.addEventListener('touchstart', handleInteraction, { passive: true, capture: true });
}

/**
 * Lazily obtains or initializes the browser AudioContext singleton.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended' && userHasInteracted) {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * Pure helper determining whether notification sound should play.
 * Ensures:
 * 1. Sound is enabled in user settings.
 * 2. Sound only plays for genuinely new notifications, never existing or duplicate IDs.
 */
export function shouldPlayNotificationSound(
  notificationId: string,
  knownIds: Set<string>,
  soundEnabled: boolean
): boolean {
  if (!soundEnabled) {
    return false;
  }
  if (!notificationId || knownIds.has(notificationId)) {
    return false;
  }
  return true;
}

/**
 * Plays a pleasant, subtle two-tone ting/chime sound.
 * Tone 1: E6 (~1318.5 Hz) fading out softly.
 * Tone 2: B6 (~1975.5 Hz) slightly delayed, creating a bright, gentle ting.
 * Duration: < 0.45s total, gentle volume (0.12 gain), completely self-contained.
 */
export function playNotificationChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      if (ctx.state === 'suspended') {
        // Autoplay policy prevents playing sound until user clicks on the page
        return;
      }
    }

    const now = ctx.currentTime;

    // Master Gain for smooth volume control
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.12, now);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    masterGain.connect(ctx.destination);

    // Primary bell tone (E6: 1318.5 Hz)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, now);

    // Subtle overtone (B6: 1975.5 Hz) enters 35ms later
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.5, now + 0.035);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.setValueAtTime(0.07, now + 0.035);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc1.connect(masterGain);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.42);

    osc2.start(now + 0.035);
    osc2.stop(now + 0.32);
  } catch (err) {
    // Non-blocking fallback; never crash the app
    console.debug('Notification chime could not play:', err);
  }
}
