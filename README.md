# SuruGPT

A personal chat interface built with React and TypeScript, featuring a long-term memory system powered by vector embeddings and a customized "best friend" persona.

**Live Demo:** [https://suru-gpt.vercel.app](https://suru-gpt.vercel.app) (Replace with your actual Vercel link)

## The Project
Most AI wrappers are just pass-throughs to an API. With SuruGPT, I wanted to focus on two things: **UI/UX polish** and **Context Persistence**. 

I built this to explore how to give an LLM a "memory" of past interactions without bloating every single request with the entire chat history.

## Technical Highlights

### 🧠 Contextual Memory (Vector Search)
To keep the AI's "memory" relevant without hitting token limits, I implemented a retrieval system using OpenAI's `text-embedding-3-small` model. 
*   **Summarization:** When a session ends (or the tab closes), a serverless function generates a compact summary of the chat.
*   **Vector Storage:** These summaries are stored as 1536-dimensional vectors in Firestore.
*   **Retrieval:** When you send a new message, the app calculates the cosine similarity between your current query and past summaries to "remember" the most relevant context.

### ⚡ Persistence & Beacon API
Handling the "end of a session" in a web app is tricky. I used the `navigator.sendBeacon` API to ensure that even if a user closes the tab abruptly, the current conversation is summarized and saved to long-term memory without delaying the UI.

### 🎨 Custom UI/UX
*   **Persona-Driven Design:** The UI uses a deep purple-gray and pink accent theme to match the "bratty/tease-y best friend" personality defined in the system prompts.
*   **Smooth State Management:** Used custom hooks (`useChat`) to manage complex states like streaming chunks, session transitions, and optimistic UI updates for chat titles.
*   **Responsive:** Fully mobile-friendly sidebar and input logic.

## Tech Stack
*   **Frontend:** React 19, TypeScript, Tailwind CSS.
*   **Backend:** Vercel Serverless Functions (Node.js).
*   **Database & Auth:** Firebase Firestore (Admin SDK for secure transactions) and Firebase Auth.
*   **AI:** OpenAI API (GPT-4o-mini for chat, Text-Embeddings-3 for memory).

## Key Engineering Challenges I Solved
*   **Race Conditions:** Managing the transition between "Pending" session IDs and "Real" Firestore IDs during the first message stream.
*   **Streaming UX:** Implementing a smooth typing effect and auto-scrolling that doesn't feel jumpy for the user.
*   **Secure Admin Operations:** Moving deletion and renaming logic to the backend using the Firebase Admin SDK to ensure users can only modify their own data.

---
*Created by a soon-to-be grad looking for new opportunities. Feel free to reach out!*
