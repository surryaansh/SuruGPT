# SuruGPT

SuruGPT is an agentic GenAI system built around a tightly integrated **agent layer + RAG-based memory system** for context-aware, multi-step interactions.

Built with React and TypeScript.  
**Live Demo:** [https://surugpt.com](https://surugpt.com)

## Overview

Most AI chatbots are simple API wrappers. SuruGPT is designed as a system where **reasoning and memory work together**.

It combines:
- An **intent-driven agent layer** for decision-making  
- A **custom RAG pipeline** for long-term memory  

This allows the system to retrieve, filter, and inject relevant past context dynamically, enabling continuity across sessions without exceeding token limits.

**Core flow:**

`User Input` → `Agent Reasoning` → `RAG Retrieval` → `Context Injection` → `Response`

## Architecture

### Agent Layer

The agent layer controls how the system thinks and acts:

- Interprets user intent  
- Decides when and how to retrieve memory  
- Structures context before generation  
- Uses JSON-structured outputs for controlled behavior and future tool invocation  

This ensures responses are not just generated—but **orchestrated**.

### RAG Memory System

RAG is a core part of the system, not an add-on.

A custom pipeline enables long-term memory:

- **Summarization:** Conversations are compressed at session end  
- **Embeddings:** Generated using `text-embedding-3-small`  
- **Storage:** Stored as vectors in Firestore  
- **Retrieval:** Cosine similarity used to fetch relevant past context  

Retrieved memories are:
- Ranked for relevance  
- Filtered to avoid noise  
- Injected into the prompt  

This enables:
- Continuity across sessions  
- Efficient token usage  
- Context grounded in past interactions  

## System Details

- Uses `navigator.sendBeacon` to persist memory on tab close without blocking UI  
- Handles race conditions between temporary and persisted session IDs  
- Streams responses with stable UI updates using custom state management (`useChat`)  

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS  
- **Backend:** Vercel Serverless Functions (Node.js)  
- **Database & Auth:** Firebase Firestore, Firebase Auth  
- **AI:**
  - GPT-4o-mini (generation)
  - text-embedding-3-small (embeddings)

## Key Challenges

- Synchronizing session state during streaming  
- Maintaining high-signal memory retrieval without context pollution  
- Ensuring reliable persistence in a browser environment
