// Controllers/postController.js - FIXED VERSION
const conn = require('../config/db');

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
    if (diffInSeconds < 2419200) { // 28 days
        const weeks = Math.floor(diffInSeconds / 604800);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (diffInSeconds < 29030400) { // 336 days (approx 11 months)
        const months = Math.floor(diffInSeconds / 2419200);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    
    // For older dates, return formatted date
    return postDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

exports.getAllPosts = async (req, res) => {
    try {
        // Check if user exists in session
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        // Get posts with user information
        const postsQuery = `
            SELECT 
                p.post_id as id,
                p.user_id,
                p.title,
                p.body as content,
                p.type,
                p.urgency,
                p.status,
                p.date_posted as created_at,
                p.is_official,
                u.first_name,
                u.last_name,
                u.username,
                u.photo,
                COALESCE((SELECT COUNT(*) FROM PostLike WHERE post_id = p.post_id), 0) as likes_count,
                COALESCE((SELECT COUNT(*) FROM PostComment WHERE post_id = p.post_id), 0) as comments_count
            FROM StatusPost p
            LEFT JOIN User u ON p.user_id = u.user_id
            ORDER BY p.date_posted DESC
        `;
        
        const [posts] = await conn.execute(postsQuery);
        
        // For each post, fetch its comments
        const transformedPosts = [];
        
        for (const post of posts) {
            // Get comments for this post
            const commentsQuery = `
                SELECT 
                    c.comment_id as id,
                    c.content,
                    c.created_at,
                    u.first_name,
                    u.last_name,
                    u.username,
                    u.photo
                FROM PostComment c
                LEFT JOIN User u ON c.user_id = u.user_id
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC
            `;
            
            const [comments] = await conn.execute(commentsQuery, [post.id]);
            
            // Transform comments
            const transformedComments = comments.map(comment => ({
                id: comment.id,
                content: comment.content,
                user_name: comment.first_name && comment.last_name ? 
                    `${comment.first_name} ${comment.last_name}` : 'Unknown User',
                user_avatar: comment.first_name ? comment.first_name.charAt(0) : 'U',
                time_ago: formatTimeAgo(comment.created_at)
            }));
            
            // Transform post
            const firstName = post.first_name || 'Unknown';
            const lastName = post.last_name || 'User';
            
            transformedPosts.push({
                id: post.id,
                user_id: post.user_id,
                user_name: `${firstName} ${lastName}`.trim(),
                user_avatar: firstName.charAt(0) || 'U',
                user_role: 'Resident',
                title: post.title || '',
                content: post.content || '',
                type: post.type || 'update',
                urgency: post.urgency || 'low',
                status: post.status || 'Pending',
                time_ago: formatTimeAgo(post.created_at),
                likes: post.likes_count || 0,
                comments_count: post.comments_count || 0,
                comments: transformedComments, // Add comments array
                shares: 0,
                is_official: post.is_official === 1 ? true : false
            });
        }
        
        res.render('dashboard', { 
            posts: transformedPosts,
            user: req.session.user,
            success: req.session.success || req.query.success,
            error: req.session.error
        });
        
        // Clear session messages
        delete req.session.success;
        delete req.session.error;
        
    } catch (err) {
        console.error('Error in getAllPosts:', err);
        res.status(500).send('Server error: ' + err.message);
    }
};

exports.createPost = async (req, res) => {
    try {
        const { title, content, type, urgency } = req.body;
        
        // Make sure we have the user ID from session
        if (!req.session.user || !req.session.user.id) {
            req.session.error = 'You must be logged in to create a post';
            return res.redirect('/login');
        }
        
        const userId = req.session.user.id;
        
        console.log('Creating post for user ID:', userId); // Debug log
        
        // First, check if the user exists in the database
        const [userCheck] = await conn.execute(
            'SELECT user_id, first_name, last_name FROM User WHERE user_id = ?', 
            [userId]
        );
        
        if (userCheck.length === 0) {
            console.error('User not found in database:', userId);
            req.session.error = 'User account not found. Please try logging in again.';
            return res.redirect('/login');
        }
        
        console.log('User found:', userCheck[0]); // Debug log
        
        // Insert the post
        const query = `
            INSERT INTO StatusPost (user_id, title, body, type, urgency, status, date_posted)
            VALUES (?, ?, ?, ?, ?, 'Pending', NOW())
        `;
        
        const [result] = await conn.execute(query, [
            userId, 
            title || null, 
            content, 
            type || 'update', 
            urgency || 'low'
        ]);
        
        console.log('Post created with ID:', result.insertId); // Debug log
        
        req.session.success = 'Post created successfully!';
        res.redirect('/client/dashboard');
        
    } catch (err) {
        console.error('Error in createPost:', err);
        req.session.error = 'Failed to create post. Please try again.';
        res.redirect('/client/dashboard');
    }
};

exports.likePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.id;
        
        // Check if already liked
        const checkQuery = 'SELECT * FROM PostLike WHERE post_id = ? AND user_id = ?';
        const [existing] = await conn.execute(checkQuery, [postId, userId]);
        
        if (existing.length > 0) {
            // Unlike
            const deleteQuery = 'DELETE FROM PostLike WHERE post_id = ? AND user_id = ?';
            await conn.execute(deleteQuery, [postId, userId]);
        } else {
            // Like
            const insertQuery = 'INSERT INTO PostLike (post_id, user_id) VALUES (?, ?)';
            await conn.execute(insertQuery, [postId, userId]);
        }
        
        res.redirect('back');
    } catch (err) {
        console.error('Error in likePost:', err);
        res.status(500).send('Server error');
    }
};

exports.addComment = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.id;
        const { content } = req.body;
        
        const query = 'INSERT INTO PostComment (post_id, user_id, content) VALUES (?, ?, ?)';
        await conn.execute(query, [postId, userId, content]);
        
        res.redirect('back');
    } catch (err) {
        console.error('Error in addComment:', err);
        res.status(500).send('Server error');
    }
};

exports.getPost = async (req, res) => {
    try {
        const postId = req.params.id;
        
        // Get the post details
        const postQuery = `
            SELECT p.*, u.username, u.first_name, u.last_name, u.photo,
            (SELECT COUNT(*) FROM PostLike WHERE post_id = p.post_id) as likes_count,
            (SELECT COUNT(*) FROM PostComment WHERE post_id = p.post_id) as comments_count
            FROM StatusPost p
            JOIN User u ON p.user_id = u.user_id
            WHERE p.post_id = ?
        `;
        
        const [postResults] = await conn.execute(postQuery, [postId]);
        
        if (postResults.length === 0) {
            return res.status(404).send('Post not found');
        }
        
        // Get comments for this post
        const commentsQuery = `
            SELECT c.*, u.username, u.first_name, u.last_name, u.photo
            FROM PostComment c
            JOIN User u ON c.user_id = u.user_id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
        `;
        
        const [commentsResults] = await conn.execute(commentsQuery, [postId]);
        
        res.render('client/post', {
            post: postResults[0],
            comments: commentsResults,
            user: req.session.user
        });
    } catch (err) {
        console.error('Error in getPost:', err);
        res.status(500).send('Server error');
    }
};