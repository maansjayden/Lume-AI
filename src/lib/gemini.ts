import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toUpperCase();
    const isRateLimit = 
      error?.status === 429 || 
      error?.error?.code === 429 ||
      errorStr.includes('429') || 
      errorStr.includes('RESOURCE_EXHAUSTED') ||
      errorStr.includes('QUOTA') ||
      errorStr.includes('EXCEEDED QUOTA');

    const isRpcError = 
      error?.status === 500 || 
      error?.error?.code === 500 ||
      errorStr.includes('500') || 
      errorStr.includes('RPC FAILED') ||
      errorStr.includes('XHR ERROR') ||
      errorStr.includes('UNKNOWN');

    if (retries > 0 && (isRateLimit || isRpcError)) {
      const reason = isRateLimit ? 'Rate limit' : 'RPC/Server error';
      console.warn(`${reason} hit, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export type LumeModule = "EYE_FEEL" | "READ_LUME";

const PROMPTS: Record<LumeModule, string> = {
  EYE_FEEL: "Act as a real-time assistant for a visually impaired person. Describe the surroundings in exactly one or two concise sentences. Include the mood and critical navigation cues like obstacles or traffic lights. ONLY mention food, drinks, or allergens if they are clearly visible in the image; otherwise, do not mention them at all. Use relative directional cues like 'to your left', 'to your right', or 'straight ahead'. Do not use clock-face directions (e.g., 'at 2 o'clock'). Do not use asterisks or special formatting.",
  READ_LUME: "Act as a cognitive accessibility assistant for people with dyslexia or autism. Summarize this document in exactly one or two very simple, clear sentences. Use plain language, avoid complex words, and focus on the most important message. Do not use any asterisks or special formatting."
};

export async function processImage(module: LumeModule, base64Image: string) {
  return withRetry(async () => {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: PROMPTS[module] },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1] || base64Image,
              },
            },
          ],
        },
      ],
    });

    const response = await model;
    const text = response.text || "I'm sorry, I couldn't process that image.";
    return text.replace(/\*/g, '');
  });
}

export async function chatWithLume(userMessage: string, context?: string) {
  return withRetry(async () => {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { 
              text: `You are LUME, a helpful assistant for a visually impaired person. 
                     Answer the user's question concisely in one or two sentences. 
                     Use relative directional cues like 'to your left', 'to your right', or 'straight ahead'. 
                     Do not use clock-face directions (e.g., 'at 2 o'clock').
                     ONLY mention food, drinks, or allergens if they are relevant to the question or clearly visible in the context; otherwise, do not mention them.
                     Do not use any asterisks or special formatting.
                     ${context ? `Context of what you just saw: ${context}` : ""}
                     User question: ${userMessage}` 
            },
          ],
        },
      ],
    });

    const response = await model;
    const result = response.text || "I'm sorry, I couldn't understand that.";
    return result.replace(/\*/g, '');
  });
}
