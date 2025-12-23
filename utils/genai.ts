
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StickerInfo, STICKER_MAP } from "./audioHelpers";
import { logger } from "./logger";

// Helper to get a fresh AI client instance.
// Critical: We must instantiate this *inside* the function calls because 
// process.env.API_KEY might be populated dynamically after the module has loaded
// (e.g., after the user selects a key via window.aistudio).
const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

export const generateStorySession = async (
  noteSequence: string[]
): Promise<string[]> => {
  // Check availability inside the function
  if (!process.env.API_KEY) {
    logger.warn("No API Key found. Using fallback story text.");
    return noteSequence.map(note => {
      const char = STICKER_MAP[note];
      return `Help ${char?.characterName || 'your friend'} play the note ${note}!`;
    });
  }

  logger.info(`Starting Story Generation for ${noteSequence.length} notes...`);

  try {
    const ai = getAiClient();
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

    logger.info("Sending prompt to Gemini Flash...");
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
      logger.success("Story text generated successfully.");
      return json;
    } else {
        // Fallback if length mismatch or error, fill missing with defaults
        logger.warn("GenAI returned mismatching length or invalid format. Filling with defaults.");
        const filled = noteSequence.map((note, i) => 
          (Array.isArray(json) && json[i]) ? json[i] : `Play ${note}!`
        );
        return filled;
    }

  } catch (error: any) {
    logger.error(`GenAI Error: ${error.message}`);
    console.error("GenAI Error:", error);
    return noteSequence.map(note => `Play ${note}!`);
  }
};

export const generateSpeech = async (text: string, attempt = 1): Promise<string | null> => {
  if (!process.env.API_KEY) return null;

  try {
    const ai = getAiClient();
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

  } catch (error: any) {
    // Retry logic for rate limits or transient errors
    if (attempt <= 3 && (error.status === 429 || error.message?.includes('429') || error.status === 503)) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn(`TTS Rate limit/Error. Retrying "${text.substring(0, 10)}..." in ${delay}ms (Attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateSpeech(text, attempt + 1);
    }
    
    logger.error(`TTS Error for "${text.substring(0, 10)}...": ${error.message}`);
    return null;
  }
};

export const generateSpeechBatch = async (texts: string[]): Promise<(string | null)[]> => {
  if (!process.env.API_KEY) return texts.map(() => null);

  logger.info(`Starting TTS Batch Process. Total items: ${texts.length}`);

  // Execute all requests in parallel ("Single Batch" logic)
  const promises = texts.map(async (text, index) => {
    try {
      // Add a tiny random jitter to prevent perfect synchronization of requests hitting the server
      await new Promise(r => setTimeout(r, Math.random() * 200)); 
      const audio = await generateSpeech(text);
      return audio;
    } catch (e) {
      return null;
    }
  });

  const results = await Promise.all(promises);

  logger.success("All Audio Batches completed.");
  return results;
};
