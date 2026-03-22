// test-chat.js - Test the AI service
require('dotenv').config();
const aiService = require('./Ai/aiService');

async function testChat() {
    console.log('Testing AI Service...\n');
    
    const testMessages = [
        "Hello! How are you?",
        "How do I request a Barangay Clearance?",
        "What are the emergency hotlines?"
    ];
    
    for (const message of testMessages) {
        console.log(`\n--- User: ${message} ---`);
        const response = await aiService.generateResponse(message, { 
            pageContext: 'dashboard',
            userRole: 'resident'
        }, []);
        console.log(`Assistant: ${response}\n`);
        console.log('--- End of response ---\n');
    }
}

testChat().catch(console.error);