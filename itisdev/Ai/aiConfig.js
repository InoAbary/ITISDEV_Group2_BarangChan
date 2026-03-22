// Ai/aiConfig.js - Simplified for qwen2.5:3b
require('dotenv').config();

// AI Provider Configuration
const AI_PROVIDERS = {
    OPENAI: 'openai',
    GEMINI: 'gemini',
    DEEPSEEK: 'deepseek',
    OLLAMA: 'ollama'
};

// Current provider - using Ollama with qwen2.5:3b
const CURRENT_PROVIDER = process.env.AI_PROVIDER || AI_PROVIDERS.OLLAMA;

// Model configuration - Optimized for qwen2.5:3b
const MODEL_CONFIG = {
    ollama: {
        model: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
        host: process.env.OLLAMA_HOST || 'http://localhost:11434',
        temperature: 0.7,
        maxTokens: 300,
        topP: 0.9,
        numCtx: 1024,
        repeatPenalty: 1.1,
        timeout: 120000 // 2 minutes timeout
    },
    openai: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 300
    },
    gemini: {
        model: 'gemini-2.0-flash-lite-001',
        temperature: 0.7,
        maxTokens: 300
    },
    deepseek: {
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 300
    }
};

// System prompt for BarangChan AI Assistant
const SYSTEM_PROMPT = `You are BarangChan AI Assistant, a helpful guide for the BarangChan platform in the Philippines.

Be concise and helpful. Use Taglish (mix of Tagalog and English). Keep responses short.

BarangChan features:
- Status posts (updates, queries, complaints, announcements)
- Document requests (Barangay Clearance, Certificate of Residency, Cedula)
- Complaint filing with evidence
- Forum discussions
- Emergency contacts (911, 117, 160, 143)

Quick help:
- Create post: Go to Dashboard, click "What's on your mind?"
- Request clearance: Go to Requests, click "New Request", upload ID
- File complaint: Go to Complaints, click "File New Complaint"
- Emergency: Call 911

Respond warmly and directly.`;

module.exports = {
    AI_PROVIDERS,
    CURRENT_PROVIDER,
    MODEL_CONFIG,
    SYSTEM_PROMPT
};