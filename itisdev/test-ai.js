// test-ai.js - Test AI Service
require('dotenv').config();
const aiService = require('./Ai/aiService');

async function test() {
    console.log('🧪 Testing AI Service...\n');
    
    const testMessages = [
        "How do I request a Barangay Clearance?",
        "What are the requirements for filing a complaint?",
        "Paano mag-apply ng cedula?",
        "Show me emergency contacts"
    ];
    
    for (const message of testMessages) {
        console.log(`\n👤 User: ${message}`);
        console.log('🤖 Thinking...');
        
        const startTime = Date.now();
        const response = await aiService.generateResponse(message, { pageContext: 'dashboard' }, []);
        const time = Date.now() - startTime;
        
        console.log(`✅ Response (${time}ms):`);
        console.log(response);
        console.log('---');
    }
}

test().catch(console.error);