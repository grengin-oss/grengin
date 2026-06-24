/**
 * Text-to-Speech Utilities
 * Manages TTS state across all messages, ensuring only one speaks at a time
 */

export interface TTSState {
  messageId: string | null;
  isSpeaking: boolean;
  isPaused: boolean;
  utterance: SpeechSynthesisUtterance | null;
}

// Global TTS state using a simple reactive pattern for Svelte 5
let state: TTSState = {
  messageId: null,
  isSpeaking: false,
  isPaused: false,
  utterance: null,
};

type Subscriber = (state: TTSState) => void;
const subscribers = new Set<Subscriber>();

function notifySubscribers() {
  subscribers.forEach((fn) => fn(state));
}

export function subscribeTTSState(fn: Subscriber): () => void {
  subscribers.add(fn);
  fn(state); // Initial call with current state
  return () => subscribers.delete(fn);
}

export function getTTSState(): TTSState {
  return state;
}

// Check if browser supports speech synthesis
export const speechSynthesisSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Extract plain text from content (removing markdown)
 */
export function extractPlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/#{1,6}\s+/g, '') // Remove heading markers
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert links to text
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Remove bold/italic
    .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
    .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
    .trim();
}

/**
 * Start speaking a message
 */
export function startSpeaking(messageId: string, content: string): void {
  if (!speechSynthesisSupported) return;

  // Stop any currently speaking message
  if (state.isSpeaking) {
    stopSpeaking();
  }

  const textToSpeak = extractPlainText(content);
  if (!textToSpeak) return;

  const utterance = new SpeechSynthesisUtterance(textToSpeak);

  utterance.onstart = () => {
    state = {
      messageId,
      isSpeaking: true,
      isPaused: false,
      utterance,
    };
    notifySubscribers();
  };

  utterance.onend = () => {
    state = {
      messageId: null,
      isSpeaking: false,
      isPaused: false,
      utterance: null,
    };
    notifySubscribers();
  };

  utterance.onerror = () => {
    state = {
      messageId: null,
      isSpeaking: false,
      isPaused: false,
      utterance: null,
    };
    notifySubscribers();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Pause current speech
 */
export function pauseSpeaking(): void {
  if (!speechSynthesisSupported) return;

  if (state.isSpeaking && !state.isPaused) {
    window.speechSynthesis.pause();
    state = {
      ...state,
      isPaused: true,
    };
    notifySubscribers();
  }
}

/**
 * Resume current speech
 */
export function resumeSpeaking(): void {
  if (!speechSynthesisSupported) return;

  if (state.isSpeaking && state.isPaused) {
    window.speechSynthesis.resume();
    state = {
      ...state,
      isPaused: false,
    };
    notifySubscribers();
  }
}

/**
 * Stop current speech
 */
export function stopSpeaking(): void {
  if (!speechSynthesisSupported) return;

  window.speechSynthesis.cancel();
  state = {
    messageId: null,
    isSpeaking: false,
    isPaused: false,
    utterance: null,
  };
  notifySubscribers();
}

/**
 * Toggle play/pause for a specific message
 */
export function toggleSpeaking(messageId: string, content: string): void {
  if (!speechSynthesisSupported) return;

  if (state.messageId === messageId) {
    // This message is currently active
    if (state.isSpeaking && !state.isPaused) {
      pauseSpeaking();
    } else if (state.isSpeaking && state.isPaused) {
      resumeSpeaking();
    }
  } else {
    // Start speaking this message
    startSpeaking(messageId, content);
  }
}

/**
 * Check if a specific message is speaking
 */
export function isMessageSpeaking(messageId: string): boolean {
  return state.messageId === messageId && state.isSpeaking;
}

/**
 * Check if a specific message is paused
 */
export function isMessagePaused(messageId: string): boolean {
  return state.messageId === messageId && state.isPaused;
}
