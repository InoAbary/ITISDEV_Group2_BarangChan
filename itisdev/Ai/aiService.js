// Ai/aiService.js - Working non-streaming version with fixes
const axios = require('axios');
const { SYSTEM_PROMPT, MODEL_CONFIG, CURRENT_PROVIDER, AI_PROVIDERS } = require('./aiConfig');

class AIService {
    constructor() {
        this.provider = CURRENT_PROVIDER;
        this.fallbackUsed = false;
        this.availableModels = [];
        this.currentModel = null;
        this.isConfigured = false;
        this.connectionMethod = null;
        this.ollamaUrl = null;
        this.initializeProvider();
    }

    async initializeProvider() {
        console.log('🔧 Initializing AI Service with qwen2.5:3b...');
        
        if (this.provider === AI_PROVIDERS.OLLAMA) {
            await this.initOllamaWithMultipleMethods();
        } else if (this.provider === AI_PROVIDERS.GEMINI) {
            this.apiKey = process.env.GEMINI_API_KEY;
            this.model = MODEL_CONFIG.gemini.model;
            this.isConfigured = this.apiKey && this.apiKey.startsWith('AIza');
            console.log(`Gemini configured: ${this.isConfigured ? 'Yes' : 'No'}`);
        } else if (this.provider === AI_PROVIDERS.OPENAI) {
            this.apiKey = process.env.OPENAI_API_KEY;
            this.model = MODEL_CONFIG.openai.model;
            this.isConfigured = !!this.apiKey;
        }
    }

    async initOllamaWithMultipleMethods() {
        const connectionMethods = [
            { name: 'Direct Local', url: 'http://localhost:11434' },
            { name: 'Network Host', url: `http://${process.env.OLLAMA_HOST || 'localhost'}:11434` }
        ];

        for (const method of connectionMethods) {
            try {
                console.log(`🔍 Trying ${method.name}: ${method.url}...`);
                
                const response = await axios.get(`${method.url}/api/tags`, {
                    timeout: 5000
                });
                
                if (response.data && response.data.models) {
                    this.availableModels = response.data.models.map(m => m.name);
                    this.ollamaUrl = method.url;
                    this.connectionMethod = method.name;
                    
                    console.log(`✅ Connected to Ollama via ${method.name}`);
                    console.log(`📋 Available models:`, this.availableModels);
                    
                    const selectedModel = this.findBestModel();
                    if (selectedModel) {
                        this.currentModel = selectedModel;
                        this.isConfigured = true;
                        console.log(`🎯 Using model: ${this.currentModel}`);
                        return;
                    }
                }
            } catch (error) {
                console.log(`❌ ${method.name} failed:`, error.message);
            }
        }
        
        console.log('⚠️ Could not connect to Ollama. Using fallback responses.');
        this.isConfigured = false;
    }

    findBestModel() {
        const preferredModels = [
            process.env.OLLAMA_MODEL,
            'qwen2.5:3b',
            'qwen2.5:1.5b',
            'llama3.2:3b',
            'llama3.2:1b'
        ].filter(Boolean);
        
        for (const model of preferredModels) {
            const found = this.availableModels.find(m => 
                m === model || 
                m.startsWith(model.split(':')[0])
            );
            if (found) {
                console.log(`✅ Found preferred model: ${found}`);
                return found;
            }
        }
        
        if (this.availableModels.length > 0) {
            console.log(`⚠️ Using first available model: ${this.availableModels[0]}`);
            return this.availableModels[0];
        }
        
        return null;
    }

    async generateResponse(userMessage, context = {}, conversationHistory = []) {
        if (!this.isConfigured) {
            console.log('⚠️ AI not configured, using fallback');
            return this.getFallbackResponse(userMessage);
        }
        
        const prompt = this.buildPrompt(userMessage, context, conversationHistory);
        
        try {
            const config = MODEL_CONFIG.ollama;
            
            console.log(`🤖 Calling Ollama at ${this.ollamaUrl} with model: ${this.currentModel}...`);
            const startTime = Date.now();
            
            const response = await axios.post(`${this.ollamaUrl}/api/chat`, {
                model: this.currentModel,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                stream: false,
                options: {
                    temperature: config.temperature,
                    num_predict: config.maxTokens,
                    top_p: config.topP,
                    num_ctx: config.numCtx,
                    repeat_penalty: config.repeatPenalty
                }
            }, {
                timeout: config.timeout
            });
            
            const responseTime = Date.now() - startTime;
            console.log(`✅ AI response in ${(responseTime / 1000).toFixed(1)}s`);
            
            if (response.data && response.data.message && response.data.message.content) {
                return this.cleanResponse(response.data.message.content);
            }
            
            throw new Error('Invalid response from Ollama');
            
        } catch (error) {
            console.error(`❌ Error:`, error.message);
            if (error.code === 'ECONNREFUSED') {
                return "🔌 Cannot connect to Ollama. Please make sure Ollama is running (`ollama serve`). For immediate help, click 'Talk to Moderator'.";
            }
            if (error.code === 'ETIMEDOUT') {
                return "⏰ The AI is taking longer than expected. Please try again or click 'Talk to Moderator' for immediate assistance.";
            }
            return this.getFallbackResponse(userMessage);
        }
    }

    cleanResponse(response) {
        if (!response) return '';
        
        let cleaned = response;
        cleaned = cleaned.replace(/^(Thinking|Analyzing|Reasoning|Processing):/gi, '');
        
        const lines = cleaned.split('\n');
        let result = [];
        let inCodeBlock = false;
        
        for (let line of lines) {
            if (line.trim() === '```') {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (!inCodeBlock && !line.trim().startsWith('//') && !line.trim().startsWith('/*')) {
                result.push(line);
            }
        }
        
        cleaned = result.join('\n').trim();
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        return cleaned;
    }

    buildPrompt(userMessage, context, conversationHistory) {
        let prompt = '';
        
        if (context.pageContext && context.pageContext !== 'general') {
            const pageName = context.pageContext.replace(/^\//, '').replace(/-/g, ' ');
            prompt += `Page: ${pageName}\n`;
        }
        
        if (context.userRole && context.userRole !== 'guest') {
            prompt += `Role: ${context.userRole}\n`;
        }
        
        if (conversationHistory && conversationHistory.length > 0) {
            const recent = conversationHistory.slice(-4);
            if (recent.length > 0) {
                prompt += `\nPrevious:\n`;
                recent.forEach(msg => {
                    if (msg.content && msg.content.length < 150) {
                        const role = msg.role === 'user' ? 'User' : 'Assistant';
                        prompt += `${role}: ${msg.content.substring(0, 100)}\n`;
                    }
                });
            }
        }
        
        prompt += `\nUser: ${userMessage}\n\nAssistant:`;
        return prompt;
    }

    getFallbackResponse(userMessage) {
        const message = userMessage.toLowerCase();
        
        if (message.includes('clearance')) {
            return "📄 **Barangay Clearance**: Go to Requests page, click 'New Request', select Barangay Clearance, upload valid ID. Pay ₱50 at barangay hall. Wait 1-2 days for approval.";
        }
        
        if (message.includes('complaint')) {
            return "⚖️ **File a Complaint**: Go to Complaints page, click 'File New Complaint', provide details and evidence, submit for review (24-48 hrs). Status will update from 'Under Review' to 'Resolved' or 'Cancelled'.";
        }
        
        if (message.includes('emergency')) {
            return "🚨 **Emergency Contacts**: 911 (Police/Fire/Medical), 117 (PNP), 160 (BFP), 143 (Red Cross). Call 911 for immediate emergencies!";
        }
        
        if (message.includes('post') || message.includes('create')) {
            return "📝 **Create a Post**: Go to Dashboard, find 'What's on your mind?', type your content, choose type (update/query/suggestion/complaint), set urgency, click 'Post'.";
        }
        
        if (message.includes('request') || message.includes('document')) {
            return "📋 **Request Documents**: Go to Requests page, click 'New Request', select document type (Clearance/Cedula/Residency), fill form, upload valid ID, wait 1-2 days for processing.";
        }
        
        if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
            return "👋 **Mabuhay!** I'm your BarangChan assistant. I can help you create posts, request documents, file complaints, or connect you to a moderator. What would you like to do? 🤗";
        }
        
        return "👋 **Mabuhay!** I'm your BarangChan assistant. I can help you create posts, request documents, file complaints, or connect you to a moderator. What would you like to do? 🤗";
    }
    
    async healthCheck() {
        return {
            timestamp: new Date(),
            provider: this.provider,
            isConfigured: this.isConfigured,
            connectionMethod: this.connectionMethod,
            currentModel: this.currentModel,
            availableModels: this.availableModels
        };
    }
}

module.exports = new AIService();