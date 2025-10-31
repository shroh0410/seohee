
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

function dataUrlToGeminiPart(dataUrl: string) {
  // data:image/jpeg;base64,....
  const [header, data] = dataUrl.split(',');
  const mimeType = header.split(':')[1].split(';')[0];
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

export async function generateDescriptionForFrames(frameDataUrls: string[]): Promise<string> {
  const model = 'gemini-2.5-flash';
  
  const prompt = "These are sequential frames from a video. Describe the short action sequence depicted in these frames as if you were describing an animated GIF. Be concise, vivid, and focus on the main action. Start your description directly, without any preamble like 'This GIF shows...'";
  
  const imageParts = frameDataUrls.map(dataUrlToGeminiPart);
  
  const contents = {
      parts: [
        { text: prompt },
        ...imageParts
      ]
  };

  try {
    const response = await ai.models.generateContent({
        model,
        contents,
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("The AI model failed to generate a description.");
  }
}
