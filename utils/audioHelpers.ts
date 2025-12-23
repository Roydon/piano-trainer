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

  // Calculate the exact MIDI number (float)
  const rawMidi = 69 + 12 * Math.log2(frequency / 440);
  
  // Round to nearest semitone
  let midiNote = Math.round(rawMidi);

  // SNAP-TO-NATURAL LOGIC:
  // We want to hide Sharps/Flats. If the detected semitone is a Sharp (Black Key),
  // we check if the raw pitch was closer to the white key below or above, and snap to it.
  
  const noteIndex = midiNote % 12;
  // Indices of sharp notes: C#(1), D#(3), F#(6), G#(8), A#(10)
  const sharpIndices = [1, 3, 6, 8, 10];

  if (sharpIndices.includes(noteIndex)) {
    // Determine distances to neighbors
    const distBelow = Math.abs(rawMidi - (midiNote - 1));
    const distAbove = Math.abs(rawMidi - (midiNote + 1));
    
    if (distBelow < distAbove) {
      midiNote -= 1; // Snap down (e.g., C# -> C)
    } else {
      midiNote += 1; // Snap up (e.g., C# -> D)
    }
  }

  // Recalculate note name using the new Natural MIDI number
  const finalIndex = midiNote % 12;
  const note = NOTE_NAMES[finalIndex]; // This will now always be a Natural note (C, D, E...)

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

export const generateRandomNote = (minOctave = 3, maxOctave = 5, excludeNote?: string): TargetNote => {
  // Only select from Natural notes (no sharps/flats)
  let note: string;
  
  // Ensure we don't pick the excluded note (to prevent back-to-back duplicates)
  do {
    note = NATURAL_NOTES[Math.floor(Math.random() * NATURAL_NOTES.length)];
  } while (excludeNote && note === excludeNote && NATURAL_NOTES.length > 1);

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