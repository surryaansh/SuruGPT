
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Use OPENAI_API_KEY, consistent with api/chat.ts
const API_KEY = process.env.OPENAI_API_KEY; 
let openai: OpenAI | null = null;

if (API_KEY) {
  openai = new OpenAI({ apiKey: API_KEY });
} else {
  console.error("CRITICAL_ERROR: OPENAI_API_KEY environment variable is not set. Summarization functionality will be disabled.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Handle warm-up ping
    console.log("/api/summarize: GET request received (warm-up ping).");
    return res.status(200).json({ message: "API is warm." });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!openai) {
    console.error("/api/summarize: OpenAI client not initialized. OPENAI_API_KEY missing.");
    return res.status(500).json({ error: 'OpenAI API key not configured on the server.' });
  }

  const { textToSummarize } = req.body;

  if (!textToSummarize || typeof textToSummarize !== 'string' || textToSummarize.trim() === '') {
    return res.status(400).json({ error: 'Invalid request body: "textToSummarize" is required and must be a non-empty string.' });
  }

  try {
    const systemPrompt = "You are an expert at creating concise and relevant chat titles. Given a piece of text, generate a chat title that is no more than 5 words and accurately reflects the main topic of the text. Respond only with the title itself, nothing else.";
    
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using a cost-effective and capable model
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Text to summarize for title: "${textToSummarize}"` }
        ],
        max_tokens: 15, // Max 5 words + some buffer
        temperature: 0.3, // Lower temperature for more deterministic titles
    });

    const summary = completion.choices[0]?.message?.content?.trim();

    if (summary && summary !== "") {
      // Remove any potential quotation marks around the title if the AI adds them
      const cleanedSummary = summary.replace(/^["']|["']$/g, '');
      return res.status(200).json({ summary: cleanedSummary });
    } else {
      console.warn("/api/summarize: OpenAI returned empty or null summary for text:", textToSummarize);
      return res.status(200).json({ summary: null }); // Successfully processed but no summary content
    }

  } catch (error: any) {
    console.error('/api/summarize: Error during OpenAI API call:', error);
    if (error instanceof OpenAI.APIError) {
        res.status(error.status || 500).json({ 
            error: `OpenAI API Error: ${error.name || 'Unknown Error'}`,
            details: error.message 
        });
    } else {
        res.status(500).json({ 
            error: 'Failed to generate summary from AI.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
  }
}
