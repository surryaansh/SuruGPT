import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { dbAdmin } from '../services/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { Message as AppMessage, SenderType } from '../types.js';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const generateContentHash = (msgs: AppMessage[]) => 
    createHash('sha256').update(msgs.map(m => `${m.sender}:${m.text}`).join('||')).digest('hex');

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!openai || !dbAdmin) return res.status(500).json({ error: "Config error" });

    const { userId, sessionId, sessionMessages } = req.body as { userId: string, sessionId: string, sessionMessages: AppMessage[] };
    if (!userId || !sessionId || !sessionMessages?.length) return res.status(400).end();

    try {
        const hash = generateContentHash(sessionMessages);
        const docRef = dbAdmin.collection('user_memories').doc(userId).collection('session_summaries').doc(sessionId);
        const existing = await docRef.get();
        if (existing.exists && existing.data()?.contentHash === hash) return res.status(200).json({ status: "unchanged" });

        const transcript = sessionMessages.map(m => `${m.sender}: ${m.text}`).join("\n").slice(0, 10000);
        const summary = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: "Summarize conversation context in 1-2 sentences for memory retrieval." }, { role: 'user', content: transcript }],
            max_tokens: 100
        });

        const text = summary.choices[0].message.content?.trim();
        if (text) {
            const emb = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
            await docRef.set({ sessionId, summaryText: text, embeddingVector: emb.data[0].embedding, contentHash: hash, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        res.status(200).json({ status: "success" });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
}