import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { dbAdmin } from '../services/firebaseAdmin.js';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { StoredSessionSummary } from '../types.js';
import { cosineSimilarity } from '../utils/helpers.js';

const API_KEY = process.env.OPENAI_API_KEY;
const openai = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

const DEFAULT_PROMPT = "You’re Suryansh, user's bestfriend. Mostly talk in English, but sometimes slip into personal, informal Hindi (like tu/tera/tujhe). Be friendly-coded but bratty, cocky and tease-y around 25% of the time. Keep replies short, playful, and vague. Use soft, minimal responses like 'hmm', 'yeah', or 'uh huh' when needed. Be stubborn, annoying, teaseful, 40% of the time. No emojis. All lowercase, add dots when changing a sentence. When the talk isn't about us and is something serious/data driven, switch to normal mode and give data driven answers in the gpt-4o style instead";

async function getPastMemories(userId: string, query: string): Promise<string> {
    if (!dbAdmin || !openai) return "";
    try {
        const queryEmb = await openai.embeddings.create({ model: "text-embedding-3-small", input: query });
        const vector = queryEmb.data[0].embedding;
        const snap = await dbAdmin.collection('user_memories').doc(userId).collection('session_summaries').get();
        const summaries = snap.docs.map(doc => ({
            text: doc.data().summaryText,
            vector: doc.data().embeddingVector
        }));
        const related = summaries
            .map(s => ({ text: s.text, score: cosineSimilarity(vector, s.vector) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 1);
        return related.length ? `\n\nPast Context: ${related[0].text}` : "";
    } catch (e) { return ""; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') return res.status(200).json({ status: "ready" });
    if (req.method !== 'POST') return res.status(405).end();
    if (!openai) return res.status(500).json({ error: "Missing API Key" });

    const { messages, userId } = req.body;
    if (!userId || !messages) return res.status(400).json({ error: "Missing data" });

    const lastMsg = messages[messages.length - 1].content;
    const memory = await getPastMemories(userId, lastMsg);

    if (messages[0].role === 'system') {
        messages[0].content += memory;
    } else {
        messages.unshift({ role: 'system', content: DEFAULT_PROMPT + memory });
    }

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini', messages, stream: true,
        });
        res.setHeader('Content-Type', 'text/plain');
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) res.write(content);
        }
        res.end();
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}