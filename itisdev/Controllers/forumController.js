// Controllers/forumController.js
const db = require('../config/db');

// Helper function for time formatting
function formatTimeAgo(date) {
    if (!date) return 'Unknown date';
    
    const now = new Date();
    const postDate = new Date(date);
    const diffInSeconds = Math.floor((now - postDate) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (diffInSeconds < 604800) {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    return postDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

exports.getAllTopics = async (req, res) => {
    try {
        const { category, search, sort, page = 1 } = req.query;
        const limit = 10;
        const offset = parseInt((page - 1) * limit, 10);
        
        // Build WHERE clause and collect parameters
        let whereClause = '';
        const filterParams = [];
        
        // Add category filter
        if (category && category !== 'All Categories' && category !== '') {
            whereClause += ` AND t.category = ?`;
            filterParams.push(category);
        }
        
        // Add search filter
        if (search && search.trim() !== '') {
            whereClause += ` AND (t.title LIKE ? OR t.content LIKE ? OR t.tags LIKE ?)`;
            const searchTerm = `%${search.trim()}%`;
            filterParams.push(searchTerm, searchTerm, searchTerm);
        }
        
        // Get total count with filters
        let countQuery = `SELECT COUNT(*) as total FROM ForumTopic t WHERE 1=1${whereClause}`;
        
        let countResult;
        if (filterParams.length > 0) {
            [countResult] = await db.execute(countQuery, filterParams);
        } else {
            [countResult] = await db.execute(countQuery);
        }
        
        const totalTopics = countResult[0].total;
        const totalPages = Math.ceil(totalTopics / limit);
        
        // Main query with filters
        let query = `
            SELECT 
                t.topic_id,
                t.user_id,
                t.title,
                t.content,
                t.category,
                t.urgency,
                t.tags,
                t.views,
                t.is_pinned,
                t.is_official,
                t.status,
                t.created_at,
                t.updated_at,
                u.first_name,
                u.last_name,
                u.username,
                u.photo
            FROM ForumTopic t
            LEFT JOIN User u ON t.user_id = u.user_id
            WHERE 1=1${whereClause}
        `;
        
        // Add sorting
        if (sort === 'Most Viewed') {
            query += ` ORDER BY t.views DESC, t.is_pinned DESC, t.created_at DESC`;
        } else {
            query += ` ORDER BY t.is_pinned DESC, t.created_at DESC`;
        }
        
        // Add pagination
        query += ` LIMIT ? OFFSET ?`;
        
        // Execute query with appropriate parameters
        let topics;
        if (filterParams.length > 0) {
            // If we have filters, use them plus pagination
            const queryParams = [...filterParams, parseInt(limit, 10), parseInt(offset, 10)];
            [topics] = await db.query(query, queryParams);
        } else {
            // If no filters, ONLY use pagination params
            [topics] = await db.query(query, [parseInt(limit, 10), parseInt(offset, 10)]);
        }
        
        // Get reply counts separately
        let replyCounts = {};
        if (topics.length > 0) {
            const topicIds = topics.map(t => t.topic_id);
            const placeholders = topicIds.map(() => '?').join(',');
            const [replies] = await db.execute(
                `SELECT topic_id, COUNT(*) as count FROM ForumReply WHERE topic_id IN (${placeholders}) GROUP BY topic_id`,
                topicIds
            );
            replies.forEach(r => replyCounts[r.topic_id] = r.count);
        }
        
        // Get stats
        const [totalTopicsResult] = await db.execute('SELECT COUNT(*) as count FROM ForumTopic');
        const [totalRepliesResult] = await db.execute('SELECT COUNT(*) as count FROM ForumReply');
        const [totalMembersResult] = await db.execute('SELECT COUNT(*) as count FROM User WHERE role = "resident"');
        
        // Get newest member
        const [newestMemberResult] = await db.execute(
            'SELECT CONCAT(first_name, " ", last_name) as name FROM User ORDER BY user_id DESC LIMIT 1'
        );
        
        // Get active users
        const [activeUsers] = await db.execute(
            'SELECT first_name FROM User WHERE last_login > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 5'
        );
        
        // Get category counts
        const [categoryCounts] = await db.execute(`
            SELECT 
                SUM(CASE WHEN category = 'general' THEN 1 ELSE 0 END) as general,
                SUM(CASE WHEN category = 'announcement' THEN 1 ELSE 0 END) as announcement,
                SUM(CASE WHEN category = 'concern' THEN 1 ELSE 0 END) as concern,
                SUM(CASE WHEN category = 'suggestion' THEN 1 ELSE 0 END) as suggestion,
                SUM(CASE WHEN category = 'emergency' THEN 1 ELSE 0 END) as emergency,
                SUM(CASE WHEN category = 'event' THEN 1 ELSE 0 END) as event
            FROM ForumTopic
        `);
        
        // Transform topics
        let transformedTopics = topics.map(topic => ({
            topic_id: topic.topic_id,
            id: topic.topic_id,
            title: topic.title,
            content: topic.content,
            category: topic.category || 'general',
            urgency: topic.urgency || 'low',
            tags: topic.tags,
            views: topic.views || 0,
            is_pinned: topic.is_pinned === 1,
            is_official: topic.is_official === 1,
            status: topic.status,
            created_at: topic.created_at,
            updated_at: topic.updated_at,
            reply_count: replyCounts[topic.topic_id] || 0,
            author_name: topic.first_name ? `${topic.first_name} ${topic.last_name || ''}`.trim() : 'Unknown User',
            author_avatar: topic.first_name ? topic.first_name.charAt(0) : 'U',
            user_name: topic.first_name ? `${topic.first_name} ${topic.last_name || ''}`.trim() : 'Unknown User',
            time_ago: formatTimeAgo(topic.created_at),
            last_activity: formatTimeAgo(topic.updated_at || topic.created_at)
        }));
        
        // Apply sorting based on reply counts or trending
        if (sort === 'Most Replies') {
            transformedTopics.sort((a, b) => b.reply_count - a.reply_count);
        } else if (sort === 'Trending') {
            transformedTopics.sort((a, b) => {
                const scoreA = a.views + a.reply_count * 3;
                const scoreB = b.views + b.reply_count * 3;
                return scoreB - scoreA;
            });
        }
        
        res.render('forum', { 
            forumTopics: transformedTopics,
            totalTopics: totalTopicsResult[0].count,
            filteredTotal: totalTopics,
            totalReplies: totalRepliesResult[0].count,
            totalMembers: totalMembersResult[0].count,
            newestMember: newestMemberResult[0]?.name || 'N/A',
            activeUsers: activeUsers,
            categoryCounts: categoryCounts[0],
            totalPages,
            currentPage: parseInt(page, 10),
            user: req.session.user,
            success: req.session.success || req.query.success,
            error: req.session.error,
            query: req.query
        });
        
        // Clear session messages
        delete req.session.success;
        delete req.session.error;
        
    } catch (err) {
        console.error('Error in getAllTopics:', err);
        console.error('SQL:', err.sql);
        console.error('SQL Message:', err.sqlMessage);
        res.status(500).send('Server error: ' + err.message);
    }
};

exports.createTopic = async (req, res) => {
    try {
        const { title, content, category, urgency, tags } = req.body;
        
        // Validate required fields
        if (!title || !content) {
            req.session.error = 'Title and content are required';
            return res.redirect('/client/forum');
        }
        
        // Check if user exists in session
        if (!req.session.user || !req.session.user.id) {
            req.session.error = 'You must be logged in to create a topic';
            return res.redirect('/login');
        }
        
        const userId = req.session.user.id;
        
        const query = `
            INSERT INTO ForumTopic (user_id, title, content, category, urgency, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        
        const [result] = await db.execute(query, [
            userId, 
            title, 
            content, 
            category || 'general', 
            urgency || 'low', 
            tags || null
        ]);
        
        req.session.success = 'Topic created successfully!';
        res.redirect('/client/forum');
        
    } catch (err) {
        console.error('Error in createTopic:', err);
        req.session.error = 'Failed to create topic: ' + err.message;
        res.redirect('/client/forum');
    }
};

exports.getTopic = async (req, res) => {
    try {
        const topicId = req.params.id;
        
        // Update view count
        await db.execute('UPDATE ForumTopic SET views = views + 1 WHERE topic_id = ?', [topicId]);
        
        // Get topic details
        const topicQuery = `
            SELECT 
                t.*, 
                u.username, 
                u.first_name, 
                u.last_name, 
                u.photo,
                u.role
            FROM ForumTopic t
            JOIN User u ON t.user_id = u.user_id
            WHERE t.topic_id = ?
        `;
        
        const [topicResults] = await db.execute(topicQuery, [topicId]);
        
        if (topicResults.length === 0) {
            return res.status(404).send('Topic not found');
        }
        
        const topic = topicResults[0];
        
        // Get replies for this topic
        const repliesQuery = `
            SELECT 
                r.*, 
                u.username, 
                u.first_name, 
                u.last_name, 
                u.photo,
                u.role
            FROM ForumReply r
            JOIN User u ON r.user_id = u.user_id
            WHERE r.topic_id = ?
            ORDER BY r.created_at ASC
        `;
        
        const [replies] = await db.execute(repliesQuery, [topicId]);
        
        // Transform topic data
        const transformedTopic = {
            id: topic.topic_id,
            title: topic.title,
            content: topic.content,
            category: topic.category,
            urgency: topic.urgency,
            tags: topic.tags,
            views: topic.views,
            is_pinned: topic.is_pinned === 1,
            is_official: topic.is_official === 1,
            status: topic.status,
            created_at: topic.created_at,
            updated_at: topic.updated_at,
            user_name: `${topic.first_name} ${topic.last_name}`,
            user_avatar: topic.first_name ? topic.first_name.charAt(0) : 'U',
            user_role: topic.role || 'Resident',
            time_ago: formatTimeAgo(topic.created_at)
        };
        
        // Transform replies data
        const transformedReplies = replies.map(reply => ({
            id: reply.reply_id,
            content: reply.content,
            created_at: reply.created_at,
            user_name: `${reply.first_name} ${reply.last_name}`,
            user_avatar: reply.first_name ? reply.first_name.charAt(0) : 'U',
            user_role: reply.role || 'Resident',
            time_ago: formatTimeAgo(reply.created_at)
        }));
        
        res.render('topic', {
            topic: transformedTopic,
            replies: transformedReplies,
            user: req.session.user,
            success: req.session.success || req.query.success,
            error: req.session.error
        });
        
        // Clear session messages
        delete req.session.success;
        delete req.session.error;
        
    } catch (err) {
        console.error('Error in getTopic:', err);
        res.status(500).send('Server error: ' + err.message);
    }
};

exports.addReply = async (req, res) => {
    try {
        const topicId = req.params.id;
        
        // Check if user exists in session
        if (!req.session.user || !req.session.user.id) {
            req.session.error = 'You must be logged in to reply';
            return res.redirect('/login');
        }
        
        const userId = req.session.user.id;
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            req.session.error = 'Reply content cannot be empty';
            return res.redirect(`/client/forum/topic/${topicId}`);
        }
        
        const query = 'INSERT INTO ForumReply (topic_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())';
        await db.execute(query, [topicId, userId, content]);
        
        // Update the topic's updated_at timestamp
        await db.execute('UPDATE ForumTopic SET updated_at = NOW() WHERE topic_id = ?', [topicId]);
        
        req.session.success = 'Reply added successfully!';
        res.redirect(`/client/forum/topic/${topicId}`);
        
    } catch (err) {
        console.error('Error in addReply:', err);
        req.session.error = 'Failed to add reply. Please try again.';
        res.redirect(`/client/forum/topic/${req.params.id}`);
    }
};

// Optional: Delete reply (moderator only)
exports.deleteReply = async (req, res) => {
    try {
        const replyId = req.params.replyId;
        
        // Check if user is moderator or admin
        if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
            req.session.error = 'You do not have permission to delete replies';
            return res.redirect('back');
        }
        
        // Get the topic ID before deleting
        const [reply] = await db.execute('SELECT topic_id FROM ForumReply WHERE reply_id = ?', [replyId]);
        
        if (reply.length === 0) {
            req.session.error = 'Reply not found';
            return res.redirect('back');
        }
        
        const topicId = reply[0].topic_id;
        
        // Delete the reply
        await db.execute('DELETE FROM ForumReply WHERE reply_id = ?', [replyId]);
        
        req.session.success = 'Reply deleted successfully';
        res.redirect(`/client/forum/topic/${topicId}`);
        
    } catch (err) {
        console.error('Error in deleteReply:', err);
        req.session.error = 'Failed to delete reply';
        res.redirect('back');
    }
};

// Optional: Pin/unpin topic (moderator only)
exports.togglePinTopic = async (req, res) => {
    try {
        const topicId = req.params.id;
        
        // Check if user is moderator or admin
        if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
            req.session.error = 'You do not have permission to pin topics';
            return res.redirect('back');
        }
        
        // Get current pin status
        const [topic] = await db.execute('SELECT is_pinned FROM ForumTopic WHERE topic_id = ?', [topicId]);
        
        if (topic.length === 0) {
            req.session.error = 'Topic not found';
            return res.redirect('back');
        }
        
        const newPinStatus = topic[0].is_pinned === 1 ? 0 : 1;
        
        await db.execute('UPDATE ForumTopic SET is_pinned = ? WHERE topic_id = ?', [newPinStatus, topicId]);
        
        req.session.success = newPinStatus ? 'Topic pinned successfully' : 'Topic unpinned successfully';
        res.redirect(`/client/forum/topic/${topicId}`);
        
    } catch (err) {
        console.error('Error in togglePinTopic:', err);
        req.session.error = 'Failed to update pin status';
        res.redirect('back');
    }
};