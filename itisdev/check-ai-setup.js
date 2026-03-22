// check-ai-setup.js - Check and install AI models
require('dotenv').config();
const { spawn } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function checkOllama() {
    console.log('\n🔍 Checking Ollama installation...\n');
    
    return new Promise((resolve) => {
        const ollama = spawn('ollama', ['list']);
        
        let output = '';
        let errorOutput = '';
        
        ollama.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        ollama.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        ollama.on('close', (code) => {
            if (code !== 0 || errorOutput.includes('command not found')) {
                console.log('❌ Ollama not found. Please install it first:');
                console.log('   Visit: https://ollama.ai');
                console.log('   Or run: curl -fsSL https://ollama.ai/install.sh | sh');
                resolve(false);
            } else {
                console.log('✅ Ollama is installed');
                console.log('📋 Available models:');
                console.log(output);
                resolve(true);
            }
        });
    });
}

async function installModel(modelName) {
    console.log(`\n📥 Installing ${modelName}...`);
    console.log('This may take a few minutes depending on your internet speed.\n');
    
    return new Promise((resolve) => {
        const pull = spawn('ollama', ['pull', modelName]);
        
        pull.stdout.on('data', (data) => {
            process.stdout.write(data);
        });
        
        pull.stderr.on('data', (data) => {
            process.stderr.write(data);
        });
        
        pull.on('close', (code) => {
            if (code === 0) {
                console.log(`\n✅ ${modelName} installed successfully!`);
                resolve(true);
            } else {
                console.log(`\n❌ Failed to install ${modelName}`);
                resolve(false);
            }
        });
    });
}

async function testAI() {
    console.log('\n🧪 Testing AI Service...\n');
    
    try {
        const aiService = require('./Ai/aiService');
        
        // Wait a moment for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('Testing with: "Hello"');
        const response = await aiService.generateResponse('Hello', { pageContext: 'dashboard' }, []);
        console.log('\nResponse:');
        console.log(response);
        console.log('\n✅ AI Service is working!\n');
        
    } catch (error) {
        console.error('❌ AI Service test failed:', error.message);
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║     🤖 BarangChan AI Setup Assistant                 ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    
    const ollamaInstalled = await checkOllama();
    
    if (!ollamaInstalled) {
        console.log('\n⚠️  Please install Ollama first:');
        console.log('   - Visit https://ollama.ai');
        console.log('   - Download and install for your OS');
        console.log('   - Run: ollama serve');
        console.log('\nAfter installing, run this script again.\n');
        process.exit(1);
    }
    
    console.log('\n📦 Recommended models to install:');
    console.log('   1. llama3.2:1b  (Lightweight, fast, 1B params)');
    console.log('   2. phi3:mini    (Efficient, good quality, 3.8B params)');
    console.log('   3. mistral      (Best quality, 7B params, more RAM)');
    console.log('   4. tinyllama    (Very light, 1.1B params)');
    
    rl.question('\nWhich model would you like to install? (1-4): ', async (choice) => {
        let model = '';
        switch(choice) {
            case '1':
                model = 'llama3.2:1b';
                break;
            case '2':
                model = 'phi3:mini';
                break;
            case '3':
                model = 'mistral';
                break;
            case '4':
                model = 'tinyllama';
                break;
            default:
                model = 'llama3.2:1b';
                console.log('Using default: llama3.2:1b');
        }
        
        await installModel(model);
        
        console.log('\n🎉 Setup complete!');
        console.log('\nTo start using the AI:');
        console.log('1. Make sure Ollama is running: ollama serve');
        console.log('2. Restart your Node.js server');
        console.log('3. The AI will automatically detect the installed model');
        
        await testAI();
        
        rl.close();
    });
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { checkOllama, installModel, testAI };