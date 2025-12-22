import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StickerInfo, STICKER_MAP } from "./audioHelpers";

// Initialize Gemini
// Note: In a real production build, ensure process.env.API_KEY is defined in your build environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateStorySession = async (
  noteSequence: string[]
): Promise<string[]> => {
  // Fallback if no API key
  if (!process.env.API_KEY) {
    return noteSequence.map(note => {
      const char = STICKER_MAP[note];
      return `Help ${char?.characterName || 'your friend'} play the note ${note}!`;
    });
  }

  try {
    const model = ai.models;
    
    // Construct the sequence description for the AI
    const sequenceDescription = noteSequence.map((note, index) => {
      const char = STICKER_MAP[note];
      return `Step ${index + 1}: Note ${note} (Character: ${char?.characterName}, Emoji: ${char?.emoji})`;
    }).join("\n");

    const prompt = `
      You are writing a continuous, interactive story for a 5-year-old child learning piano.
      The child plays through a sequence of musical notes.
      
      Here is the sequence of events (Total steps: ${noteSequence.length}):
      ${sequenceDescription}
      
      Task:
      Write a short, exciting sentence (5-15 words) for EACH step in the sequence.
      The story should flow from one step to the next, like a mini-adventure.
      
      Requirements for each sentence:
      1. Mention the Character Name for that step.
      2. Mention the Note Name for that step.
      3. Describe an action that fits this specific character (e.g., a worm wiggles, a dino stomps).
      4. Keep sentences concise.
      
      Return ONLY a JSON array of strings. Ensure the array has exactly ${noteSequence.length} items.
    `;

    const response = await model.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const json = JSON.parse(response.text || "[]");
    
    // Validate length match
    if (Array.isArray(json) && json.length === noteSequence.length) {
      return json;
    } else {
        // Fallback if length mismatch or error, fill missing with defaults
        console.warn("GenAI returned mismatching length or invalid format");
        const filled = noteSequence.map((note, i) => 
          (Array.isArray(json) && json[i]) ? json[i] : `Play ${note}!`
        );
        return filled;
    }

  } catch (error) {
    console.error("GenAI Error:", error);
    return noteSequence.map(note => `Play ${note}!`);
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!process.env.API_KEY) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, // Puck is a friendly voice
          },
        },
      },
    });
    
    // Extract base64 audio
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;

  } catch (error) {
    console.error("Gemini TTS Error:", error);
    return null;
  }
};

export const generateSpeechBatch = async (texts: string[]): Promise<(string | null)[]> => {
  if (!process.env.API_KEY) return texts.map(() => null);

  // We chunk the requests to avoid hitting rate limits or overwhelming the network with 50 simultaneous requests.
  const BATCH_SIZE = 4;
  const results: (string | null)[] = new Array(texts.length).fill(null);
  
  // Process in chunks
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunkEnd = Math.min(i + BATCH_SIZE, texts.length);
    const chunk = texts.slice(i, chunkEnd);
    
    // Create promises for current chunk
    const chunkPromises = chunk.map(async (text, idx) => {
      const globalIndex = i + idx;
      try {
        const audio = await generateSpeech(text);
        return { index: globalIndex, audio };
      } catch (e) {
        return { index: globalIndex, audio: null };
      }
    });

    // Wait for chunk to complete
    const chunkResults = await Promise.all(chunkPromises);
    
    // Store results
    chunkResults.forEach(res => {
      results[res.index] = res.audio;
    });
  }

  return results;
};