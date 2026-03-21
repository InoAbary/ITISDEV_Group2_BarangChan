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

// Controllers/postController.js - UPDATED VERSION

exports.getAllPosts = async (req, res) => {
    try {
        // Check if user exists in session
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        // FIRST: Get the user's barangay from Address table
        let userBarangay = 'San Antonio'; // Default fallback
        let userCity = 'Baliuag';
        
        try {
            const [userAddress] = await conn.execute(`
                SELECT a.barangay, a.city 
                FROM Address a 
                WHERE a.user_id = ?
            `, [req.session.user.id]);
            
            if (userAddress.length > 0) {
                userBarangay = userAddress[0].barangay || 'San Antonio';
                userCity = userAddress[0].city || 'Baliuag';
            }
        } catch (err) {
            console.error('Error fetching user barangay:', err);
        }
        
        // Store barangay info in session for other uses
        req.session.user.barangay = userBarangay;
        req.session.user.city = userCity;
        
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
                comments: transformedComments,
                shares: 0,
                is_official: post.is_official === 1 ? true : false
            });
        }

        // Fetch Barangay Info for the USER'S BARANGAY
        let barangayInfo = null;
        try {
            const [barangayResult] = await conn.execute(`
                SELECT * FROM BarangayInfo 
                WHERE barangay_name = ?
                LIMIT 1
            `, [userBarangay]);
            
            if (barangayResult.length > 0) {
                barangayInfo = barangayResult[0];
            } else {
                // If no specific barangay info exists, use default
                console.log(`No specific BarangayInfo found for ${userBarangay}, using default`);
                barangayInfo = {
                    barangay_name: userBarangay,
                    barangay_captain: 'To be updated',
                    captain_contact: 'N/A',
                    secretary: 'To be updated',
                    treasurer: 'To be updated',
                    hall_address: `Barangay Hall, ${userBarangay}, Baliuag, Bulacan`,
                    hall_phone: 'N/A',
                    hall_email: `barangay.${userBarangay.toLowerCase()}@baliuag.gov.ph`,
                    office_hours: '8:00 AM - 5:00 PM (Monday - Friday)',
                    office_hours_tagalog: '8:00 AM - 5:00 PM (Lunes - Biyernes)',
                    evacuation_center: `${userBarangay} Elementary School`,
                    evacuation_center_address: `${userBarangay}, Baliuag, Bulacan`,
                    facebook_page: '#'
                };
            }
        } catch (err) {
            console.error('Error fetching barangay info:', err);
            barangayInfo = {
                barangay_name: userBarangay,
                barangay_captain: 'To be updated',
                captain_contact: 'N/A',
                secretary: 'To be updated',
                treasurer: 'To be updated',
                hall_address: `Barangay Hall, ${userBarangay}, Baliuag, Bulacan`,
                hall_phone: 'N/A',
                hall_email: `barangay.${userBarangay.toLowerCase()}@baliuag.gov.ph`,
                office_hours: '8:00 AM - 5:00 PM (Monday - Friday)',
                evacuation_center: `${userBarangay} Elementary School`,
                evacuation_center_address: `${userBarangay}, Baliuag, Bulacan`,
                facebook_page: '#'
            };
        }
        
        // Fetch Barangay-specific contacts
        let barangayContacts = [];
        try {
            const [contacts] = await conn.execute(`
                SELECT bc.*, cc.name as category_name, cc.icon, cc.color
                FROM BarangayContact bc
                JOIN ContactCategory cc ON bc.category_id = cc.category_id
                WHERE bc.is_active = TRUE
                ORDER BY cc.display_order, bc.display_order
                LIMIT 8
            `);
            barangayContacts = contacts;
        } catch (err) {
            console.error('Error fetching barangay contacts:', err);
            barangayContacts = [];
        }
        
        // Fetch emergency hotlines
        let emergencyHotlines = [];
        try {
            const [hotlines] = await conn.execute(`
                SELECT * FROM EmergencyHotline 
                WHERE is_active = TRUE 
                ORDER BY is_national DESC, display_order
            `);
            emergencyHotlines = hotlines;
        } catch (err) {
            console.error('Error fetching hotlines:', err);
            emergencyHotlines = [
                { hotline_id: 1, name: 'National Emergency', number: '911', icon: 'fa-phone-alt', color: 'red' },
                { hotline_id: 2, name: 'PNP Hotline', number: '117', icon: 'fa-shield-alt', color: 'blue' },
                { hotline_id: 3, name: 'BFP Hotline', number: '160', icon: 'fa-fire-extinguisher', color: 'orange' },
                { hotline_id: 4, name: 'Red Cross', number: '143', icon: 'fa-ambulance', color: 'red' }
            ];
        }

        // Get announcement posts (official posts with type 'announcement')
        let announcements = [];
        try {
            const [announcementResults] = await conn.execute(`
                SELECT post_id, title, body, date_posted, type
                FROM StatusPost
                WHERE type = 'announcement' AND is_official = TRUE
                ORDER BY date_posted DESC
                LIMIT 5
            `);
            announcements = announcementResults;
        } catch (err) {
            console.error('Error fetching announcements:', err);
        }

        // Get user's address details
        let userAddress = null;
        try {
            const [addressResult] = await conn.execute(`
                SELECT * FROM Address WHERE user_id = ?
            `, [req.session.user.id]);
            userAddress = addressResult[0];
        } catch (err) {
            console.error('Error fetching user address:', err);
        }

        res.render('dashboard', { 
            posts: transformedPosts,
            user: {
                ...req.session.user,
                barangay: userBarangay,
                city: userCity,
                full_name: `${req.session.user.first_name || ''} ${req.session.user.last_name || ''}`.trim(),
                address: userAddress
            },
            success: req.session.success || req.query.success,
            error: req.session.error,
            barangayInfo: barangayInfo,
            barangayContacts: barangayContacts,
            emergencyHotlines: emergencyHotlines,
            announcements: announcements,
            stats: {
                totalResidents: await getTotalResidentsCount(conn, userBarangay),
                todayPosts: posts.filter(p => {
                    const postDate = new Date(p.created_at);
                    const today = new Date();
                    return postDate.toDateString() === today.toDateString();
                }).length
            }
        });
        
        // Clear session messages
        delete req.session.success;
        delete req.session.error;
        
    } catch (err) {
        console.error('Error in getAllPosts:', err);
        res.status(500).send('Server error: ' + err.message);
    }
};

// Helper function to get total residents count for a barangay
async function getTotalResidentsCount(conn, barangayName) {
    try {
        const [result] = await conn.execute(`
            SELECT COUNT(*) as count 
            FROM Address a
            JOIN User u ON a.user_id = u.user_id
            WHERE a.barangay = ? AND u.status = 'Active'
        `, [barangayName]);
        return result[0].count.toLocaleString();
    } catch (err) {
        console.error('Error getting residents count:', err);
        return 'N/A';
    }
}

exports.createPost = async (req, res) => {
    try {
        const { title, content, type, urgency, barangay } = req.body;
        
        if (!req.session.user || !req.session.user.id) {
            req.session.error = 'You must be logged in to create a post';
            return res.redirect('/login');
        }
        
        const userId = req.session.user.id;
        
        // Insert the post with barangay context
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