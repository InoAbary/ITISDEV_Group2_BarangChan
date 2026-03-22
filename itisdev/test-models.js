// test-models.js - Check available models
require('dotenv').config();
const axios = require('axios');

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'none');
    
    try {
        // Use v1beta API to list models
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        
        console.log('\n✅ Available models:\n');
        response.data.models.forEach(model => {
            console.log(`- ${model.name} (${model.supportedGenerationMethods?.join(', ') || 'no methods'})`);
        });
    } catch (error) {
        console.error('Error:', error.response?.data?.error?.message || error.message);
    }
}

listModels();