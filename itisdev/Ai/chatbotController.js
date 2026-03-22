// Ai/chatbotController.js - Completely fixed with fallback for missing body
const aiService = require('./aiService');
const conn = require('../config/db');

class ChatbotController {
    
    async chat(req, res) {
        try {
            console.log('📥 Incoming request to /api/chatbot/chat');
            console.log('Headers:', req.headers['content-type']);
            console.log('Method:', req.method);
            console.log('Body exists:', !!req.body);
            console.log('Body content:', req.body);
            
            // Check if body exists and extract message safely
            let message = null;
            let context = {};
            let conversationId = null;
            
            if (req.body && typeof req.body === 'object') {
                message = req.body.message;
                context = req.body.context || {};
                conversationId = req.body.conversationId;
            }
            
            // Also check query parameters as fallback
            if (!message && req.query && req.query.message) {
                message = req.query.message;
                context = { pageContext: req.query.pageContext || 'general' };
                conversationId = req.query.conversationId;
            }
            
            const userId = req.session?.user?.id || null;
            
            console.log('💬 Chat request processed:', { 
                message: message?.substring(0, 50), 
                userId,
                hasBody: !!req.body,
                messageExists: !!message
            });
            
            // If no message, try to get from raw body or send error
            if (!message || message.trim() === '') {
                // Try to get from raw body as last resort
                if (req.rawBody) {
                    try {
                        const rawData = JSON.parse(req.rawBody);
                        message = rawData.message;
                        context = rawData.context || {};
                        conversationId = rawData.conversationId;
                    } catch (e) {
                        console.error('Failed to parse raw body:', e);
                    }
                }
                
                if (!message) {
                    console.error('❌ No message found in request');
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Message is required',
                        response: "Please type a message to get help. 🤗"
                    });
                }
            }
            
            let conversationHistory = [];
            if (conversationId) {
                conversationHistory = await this.getConversationHistory(conversationId);
            }
            
            const userContext = {
                pageContext: context?.pageContext || 'general',
                userRole: req.session?.user?.role || 'guest',
                userBarangay: req.session?.user?.barangay || null,
                userId: userId,
                conversationId: conversationId
            };
            
            const startTime = Date.now();
            
            let aiResponse;
            try {
                aiResponse = await aiService.generateResponse(
                    message, 
                    userContext, 
                    conversationHistory
                );
                console.log('✅ AI Response generated successfully');
            } catch (aiError) {
                console.error('❌ AI Service Error:', aiError);
                aiResponse = "I'm having trouble connecting. Please try again or click 'Talk to Moderator' for assistance. 🙏";
            }
            
            const responseTime = Date.now() - startTime;
            const seconds = (responseTime / 1000).toFixed(1);
            
            // Save to database (non-blocking)
            this.saveChatLog(userId, message, aiResponse, responseTime).catch(dbError => {
                console.error('Failed to save chat log:', dbError);
            });
            
            // Send response
            return res.json({
                success: true,
                response: aiResponse,
                conversationId: conversationId || Date.now(),
                responseTime: `${seconds}s`,
                provider: process.env.AI_PROVIDER || 'ollama',
                model: process.env.OLLAMA_MODEL || 'qwen2.5:3b'
            });
            
        } catch (error) {
            console.error('Chatbot error:', error);
            if (!res.headersSent) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Failed to process message',
                    response: "I'm having trouble. Please try again or contact a moderator for help. 🤖"
                });
            }
        }
    }
    
    async getQuickActions(req, res) {
        try {
            const page = req.query.page || 'general';
            const userRole = req.session?.user?.role || 'guest';
            
            const actions = this.getPageActions(page, userRole);
            
            return res.json({
                success: true,
                actions: actions
            });
            
        } catch (error) {
            console.error('Error getting quick actions:', error);
            return res.json({ 
                success: true, 
                actions: this.getDefaultActions() 
            });
        }
    }
    
    getDefaultActions() {
        return [
            { text: "📝 Create a post", action: "post", message: "How do I create a post?" },
            { text: "📄 Request Barangay Clearance", action: "request", message: "How do I request Barangay Clearance?" },
            { text: "⚖️ File a complaint", action: "complaint", message: "How do I file a complaint?" },
            { text: "🚨 Emergency contacts", action: "emergency", message: "Show me emergency contacts" },
            { text: "👥 Talk to moderator", action: "moderator", message: "Connect me to a moderator" }
        ];
    }
    
    getPageActions(page, userRole) {
        const actions = {
            general: this.getDefaultActions(),
            dashboard: [
                { text: "📝 Create new post", action: "post", message: "Help me create a new post" },
                { text: "📋 View my requests", action: "requests", message: "Show me my document requests" },
                { text: "⚖️ Check complaints", action: "complaints", message: "Show me my complaints" },
                { text: "👥 Talk to moderator", action: "moderator", message: "Connect me to a moderator" }
            ],
            requests: [
                { text: "🔍 Track my request", action: "track", message: "How do I track my request?" },
                { text: "📋 Document requirements", action: "requirements", message: "What documents do I need?" },
                { text: "👥 Talk to moderator", action: "moderator", message: "I need help with my request" }
            ],
            complaints: [
                { text: "🔍 Check complaint status", action: "status", message: "What's the status of my complaint?" },
                { text: "📎 Add evidence", action: "evidence", message: "How do I add evidence?" },
                { text: "👥 Talk to moderator", action: "moderator", message: "I need help with my complaint" }
            ],
            forum: [
                { text: "📝 Create new topic", action: "topic", message: "How do I create a new forum topic?" },
                { text: "💬 Post a reply", action: "reply", message: "How do I reply to a topic?" },
                { text: "👥 Talk to moderator", action: "moderator", message: "I need help" }
            ]
        };
        
        const moderatorActions = (userRole === 'moderator' || userRole === 'administrator') ? [
            { text: "✅ Approve pending posts", action: "approve", message: "How do I approve pending posts?" },
            { text: "📋 Review complaints", action: "review", message: "Show me complaints to review" },
            { text: "🔄 Update request status", action: "update", message: "How do I update request status?" }
        ] : [];
        
        return [...(actions[page] || actions.general), ...moderatorActions];
    }
    
    async getModeratorStatus(req, res) {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            const [onlineModerators] = await conn.execute(`
                SELECT user_id, first_name, last_name, role
                FROM User 
                WHERE role IN ('moderator', 'administrator') 
                AND status = 'Active'
                AND last_login > ?
                LIMIT 5
            `, [fiveMinutesAgo]);
            
            return res.json({
                success: true,
                hasOnlineModerator: onlineModerators.length > 0,
                moderators: onlineModerators.map(m => ({
                    id: m.user_id,
                    name: `${m.first_name} ${m.last_name}`,
                    role: m.role
                }))
            });
            
        } catch (error) {
            console.error('Error getting moderator status:', error);
            return res.json({ success: false, hasOnlineModerator: false });
        }
    }
    
    async createModeratorChat(req, res) {
        try {
            const userId = req.session?.user?.id;
            
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Please login first' });
            }
            
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const [moderators] = await conn.execute(`
                SELECT user_id FROM User 
                WHERE role IN ('moderator', 'administrator') 
                AND status = 'Active'
                AND last_login > ?
                LIMIT 1
            `, [fiveMinutesAgo]);
            
            if (moderators.length === 0) {
                return res.json({ 
                    success: false, 
                    error: 'No moderators online',
                    message: 'No moderators available. Please leave a message.'
                });
            }
            
            await this.ensureModeratorMessageTable();
            
            const [result] = await conn.execute(`
                INSERT INTO ChatbotLog (user_id, query, response, created_at)
                VALUES (?, ?, ?, NOW())
            `, [userId, 'MODERATOR_CHAT_STARTED', `Chat started with moderator`]);
            
            const chatId = result.insertId;
            
            return res.json({
                success: true,
                chatId: chatId,
                moderatorId: moderators[0].user_id,
                message: 'Connecting to moderator...'
            });
            
        } catch (error) {
            console.error('Error creating moderator chat:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
    
    async ensureModeratorMessageTable() {
        try {
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS ModeratorMessage (
                    message_id INT AUTO_INCREMENT PRIMARY KEY,
                    chat_id INT NOT NULL,
                    user_id INT NOT NULL,
                    message TEXT NOT NULL,
                    is_moderator BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_chat_id (chat_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);
        } catch (error) {
            console.error('Error creating table:', error);
        }
    }
    
    async sendModeratorMessage(req, res) {
        try {
            const { chatId, message, isModerator } = req.body;
            const userId = req.session?.user?.id;
            
            if (!chatId || !message) {
                return res.status(400).json({ success: false, error: 'Missing fields' });
            }
            
            await this.ensureModeratorMessageTable();
            
            await conn.execute(`
                INSERT INTO ModeratorMessage (chat_id, user_id, message, is_moderator, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [chatId, userId, message, isModerator || false]);
            
            return res.json({ success: true });
            
        } catch (error) {
            console.error('Error sending message:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
    
    async getModeratorChatHistory(req, res) {
        try {
            const { chatId } = req.params;
            
            await this.ensureModeratorMessageTable();
            
            const [messages] = await conn.execute(`
                SELECT message, is_moderator, created_at
                FROM ModeratorMessage 
                WHERE chat_id = ?
                ORDER BY created_at ASC
            `, [chatId]);
            
            return res.json({
                success: true,
                messages: messages
            });
            
        } catch (error) {
            console.error('Error getting history:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
    
    async leaveMessage(req, res) {
        try {
            const { message } = req.body;
            const userId = req.session?.user?.id;
            
            if (!message || !userId) {
                return res.status(400).json({ success: false, error: 'Invalid request' });
            }
            
            await this.saveChatLog(userId, 'LEAVE_MESSAGE', message, null);
            
            return res.json({ success: true, message: 'Message sent to moderators' });
            
        } catch (error) {
            console.error('Error leaving message:', error);
            return res.status(500).json({ success: false, error: error.message });
        }
    }
    
    async getConversationHistory(conversationId) {
        try {
            const [logs] = await conn.execute(`
                SELECT query, response, created_at
                FROM ChatbotLog 
                WHERE log_id <= ? 
                ORDER BY created_at DESC 
                LIMIT 10
            `, [conversationId]);
            
            const history = [];
            logs.reverse().forEach(log => {
                history.push({ role: 'user', content: log.query });
                history.push({ role: 'assistant', content: log.response });
            });
            
            return history;
        } catch (error) {
            console.error('Error getting history:', error);
            return [];
        }
    }
    
    async saveChatLog(userId, query, response, responseTime) {
        try {
            const [result] = await conn.execute(`
                INSERT INTO ChatbotLog (user_id, query, response, response_time, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [userId, query.substring(0, 500), response?.substring(0, 2000), responseTime]);
            
            return result.insertId;
        } catch (error) {
            console.error('Error saving log:', error);
            return null;
        }
    }
}

module.exports = new ChatbotController();