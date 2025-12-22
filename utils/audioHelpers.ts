import { NoteData, TargetNote } from '../types';

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL_NOTES = ["C", "D", "E", "F", "G", "A", "B"];

export interface StickerInfo {
  filename: string;
  characterName: string;
  emoji: string;
}

// Mapping Notes to Sticker Filenames, Character Names, and Fallback Emojis
export const STICKER_MAP: Record<string, StickerInfo> = {
  "C": { filename: "worm.png", characterName: "Creepy", emoji: "🪱" },
  "D": { filename: "trex.png", characterName: "Dino", emoji: "🦖" },
  "E": { filename: "deer.png", characterName: "Edith", emoji: "🦌" },
  "F": { filename: "firefighter.png", characterName: "Fred", emoji: "👨‍🚒" },
  "G": { filename: "goblin.png", characterName: "Grumpy", emoji: "👺" },
  "A": { filename: "anteater.png", characterName: "Amey", emoji: "🦡" },
  "B": { filename: "chick.png", characterName: "Becky", emoji: "🐥" }
};

/**
 * Converts a frequency in Hz to a Musical Note.
 * Formula: MIDI_Number = 69 + 12 * log2(frequency / 440)
 */
export const getNoteFromFrequency = (frequency: number): NoteData | null => {
  if (!frequency || frequency < 27.5 || frequency > 4186) return null; // Piano range roughly A0 to C8

  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  const midiNote = Math.round(noteNum) + 69;

  const noteNameIndex = midiNote % 12;
  const note = NOTE_NAMES[noteNameIndex];

  // STRICT MODE: Only allow natural notes.
  // If a sharp note is detected (e.g. C#, F#), we return null to ignore it.
  if (note.includes('#')) {
    return null;
  }

  const octave = Math.floor(midiNote / 12) - 1;

  return {
    note,
    octave,
    frequency,
    cents: 0 // Simplified for this exercise
  };
};

export const formatNoteDisplay = (note: NoteData | TargetNote) => {
  return `${note.note}`; // Removed octave from display string
};

export const getNoteSticker = (note: string): StickerInfo | null => {
  return STICKER_MAP[note] || null;
};

export const generateRandomNote = (minOctave = 3, maxOctave = 5): TargetNote => {
  // Only select from Natural notes (no sharps/flats)
  const note = NATURAL_NOTES[Math.floor(Math.random() * NATURAL_NOTES.length)];
  const octave = Math.floor(Math.random() * (maxOctave - minOctave + 1)) + minOctave;
  return { note, octave };
};

// --- Audio Decoding Helpers for Gemini TTS ---

export function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}