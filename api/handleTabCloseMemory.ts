import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { dbAdmin } from '../services/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { Message as AppMessage, SenderType } from '../types.js';

const API_KEY = process.env.OPENAI_API_KEY;
let openai: OpenAI | null = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

const generateContentHash = (messages: AppMessage[]): string => {
    const stringToHash = messages.map(msg => `${msg.sender}:${msg.text}`).join('||');
    return createHash('sha256').update(stringToHash).digest('hex');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).end();
    
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    if (!openai || !dbAdmin) return res.status(204).send('');

    const { sessionId, sessionMessages, userId } = body as { sessionId?: string, sessionMessages?: AppMessage[], userId?: string };

    // Support both legacy (userId missing) and current multi-user architecture
    const targetUserId = userId || "default_user";

    if (!sessionId || !sessionMessages?.length) return res.status(204).send('');
    
    res.status(204).send(''); // Respond quickly for beacon

    try {
        const hash = generateContentHash(sessionMessages);
        const docRef = dbAdmin.collection('user_memories').doc(targetUserId).collection('session_summaries').doc(sessionId);
        
        const existing = await docRef.get();
        if (existing.exists && existing.data()?.contentHash === hash) return;

        const transcript = sessionMessages.map(m => `${m.sender === SenderType.USER ? 'User' : 'AI'}: ${m.text}`).join("\n\n").slice(0, 10000);
        
        const summary = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: "Summarize this chat context in 1-2 sentences for future retrieval." },
                { role: 'user', content: transcript }
            ],
            max_tokens: 150,
        });

        const text = summary.choices[0]?.message?.content?.trim();
        if (text) {
            const emb = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
            await docRef.set({
                sessionId,
                summaryText: text,
                embeddingVector: emb.data[0].embedding,
                contentHash: hash,
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        console.error('/api/handleTabCloseMemory error:', error);
    }
}