// Controllers/moderatorController.js
const db = require('../config/db');
const moment = require('moment');

class moderatorController {
    
    // Get moderator dashboard data
    static async getDashboard(req, res) {
        try {
            // Check if user is moderator or admin
            if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
                return res.status(403).render('error', {
                    message: 'Access denied. Moderator privileges required.',
                    user: req.session.user
                });
            }

            const userId = req.session.user.id;
            const barangay = req.session.user.barangay || 'San Antonio';

            // Initialize default values
            let stats = {
                pendingPosts: 0,
                awaitingReview: 0,
                totalRequests: 0,
                inProgressRequests: 0,
                urgentIssues: 0,
                emergencies: 0,
                resolvedThisWeek: 0,
                resolvedIncrease: 0
            };
            
            let chartData = {
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                posts: [0, 0, 0, 0, 0, 0, 0],
                requests: [0, 0, 0, 0, 0, 0, 0],
                resolved: [0, 0, 0, 0, 0, 0, 0]
            };
            
            let recentRequests = [];
            let pendingPosts = [];
            let urgentIssues = [];
            let recentActivity = [];
            let systemStats = {
                activeUsers: 0,
                chatbotLoad: 'Normal',
                serverUptime: 0,
                responseTime: 98
            };

            // ========== STATS CARDS DATA ==========
            try {
                // Pending posts count
                const [pendingPostsResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Pending'
                `);
                stats.pendingPosts = pendingPostsResult[0]?.count || 0;
                
                // Awaiting review posts
                const [awaitingReviewResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Pending' AND (type = 'complaint' OR urgency = 'high' OR urgency = 'emergency')
                `);
                stats.awaitingReview = awaitingReviewResult[0]?.count || 0;
                
                // Document requests count by status
                const [totalRequestsResult] = await db.execute(`SELECT COUNT(*) as count FROM RequestForm`);
                stats.totalRequests = totalRequestsResult[0]?.count || 0;
                
                const [inProgressRequestsResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM RequestForm 
                    WHERE status = 'Pending' OR status = 'Accepted'
                `);
                stats.inProgressRequests = inProgressRequestsResult[0]?.count || 0;
                
                // Urgent issues
                const [urgentIssuesResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE (urgency = 'high' OR urgency = 'emergency') AND status != 'Closed'
                `);
                stats.urgentIssues = urgentIssuesResult[0]?.count || 0;
                
                const [emergenciesResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE urgency = 'emergency' AND status != 'Closed'
                `);
                stats.emergencies = emergenciesResult[0]?.count || 0;
                
                // Resolved this week
                const [resolvedThisWeekResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Resolved' 
                    AND date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                `);
                stats.resolvedThisWeek = resolvedThisWeekResult[0]?.count || 0;
                
                const [resolvedLastWeekResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Resolved' 
                    AND date_posted BETWEEN DATE_SUB(NOW(), INTERVAL 14 DAY) AND DATE_SUB(NOW(), INTERVAL 7 DAY)
                `);
                const lastWeek = resolvedLastWeekResult[0]?.count || 0;
                stats.resolvedIncrease = lastWeek > 0 ? stats.resolvedThisWeek - lastWeek : stats.resolvedThisWeek;
                
            } catch (err) {
                console.error('Error fetching stats:', err.message);
            }

            // ========== CHART DATA ==========
            try {
                const [weeklyActivity] = await db.execute(`
                    SELECT 
                        DATE(date_posted) as date,
                        COUNT(*) as posts,
                        (SELECT COUNT(*) FROM RequestForm WHERE DATE(request_date) = DATE(sp.date_posted)) as requests,
                        (SELECT COUNT(*) FROM StatusPost WHERE status = 'Resolved' AND DATE(date_posted) = DATE(sp.date_posted)) as resolved
                    FROM StatusPost sp
                    WHERE date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(date_posted)
                    ORDER BY date ASC
                `);
                
                // Map day of week to index
                const dayMap = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5};
                
                weeklyActivity.forEach(day => {
                    if (day.date) {
                        const dayOfWeek = new Date(day.date).getDay();
                        const index = dayMap[dayOfWeek] !== undefined ? dayMap[dayOfWeek] : 0;
                        chartData.posts[index] = day.posts || 0;
                        chartData.requests[index] = day.requests || 0;
                        chartData.resolved[index] = day.resolved || 0;
                    }
                });
            } catch (err) {
                console.error('Error fetching chart data:', err.message);
            }

            // ========== RECENT DOCUMENT REQUESTS ==========
            try {
                const [recentRequestsData] = await db.execute(`
                    SELECT 
                        r.request_id as id,
                        CONCAT(u.first_name, ' ', u.last_name) as resident,
                        r.document_request as document_type,
                        DATE(r.request_date) as date,
                        r.status,
                        CONCAT('DOC-', r.request_id, '-', YEAR(r.request_date)) as reference_number
                    FROM RequestForm r
                    JOIN User u ON r.user_id = u.user_id
                    ORDER BY r.request_date DESC
                    LIMIT 5
                `);
                
                recentRequests = recentRequestsData.map(req => ({
                    id: req.reference_number,
                    resident: req.resident || 'Unknown',
                    type: req.document_type ? req.document_type.split('\n')[0].substring(0, 50) : 'Document Request',
                    date: req.date ? moment(req.date).format('MMM DD, YYYY') : 'N/A',
                    status: (req.status || 'pending').toLowerCase(),
                    statusDisplay: getStatusDisplay(req.status),
                    original_id: req.id
                }));
            } catch (err) {
                console.error('Error fetching recent requests:', err.message);
            }
            
            // ========== PENDING POSTS ==========
            try {
                const [pendingPostsData] = await db.execute(`
                    SELECT 
                        sp.post_id as id,
                        CONCAT(u.first_name, ' ', u.last_name) as author,
                        sp.body as content,
                        TIMESTAMPDIFF(MINUTE, sp.date_posted, NOW()) as minutes_ago,
                        sp.urgency,
                        COALESCE((SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id), 0) as reports_count
                    FROM StatusPost sp
                    JOIN User u ON sp.user_id = u.user_id
                    WHERE sp.status = 'Pending'
                    GROUP BY sp.post_id
                    ORDER BY 
                        CASE sp.urgency 
                            WHEN 'emergency' THEN 1 
                            WHEN 'high' THEN 2 
                            WHEN 'medium' THEN 3 
                            ELSE 4 
                        END,
                        sp.date_posted ASC
                    LIMIT 10
                `);
                
                pendingPosts = pendingPostsData.map(post => ({
                    id: post.id,
                    author: post.author || 'Unknown',
                    content: post.content ? post.content.substring(0, 150) : '',
                    time_ago: formatTimeAgo(post.minutes_ago),
                    urgency: post.urgency || 'low',
                    reports: post.reports_count || 0
                }));
            } catch (err) {
                console.error('Error fetching pending posts:', err.message);
            }
            
            // ========== URGENT ISSUES ==========
            try {
                const [urgentIssuesData] = await db.execute(`
                    SELECT 
                        sp.post_id as id,
                        COALESCE(sp.title, 'Untitled Issue') as title,
                        sp.body as description,
                        TIMESTAMPDIFF(MINUTE, sp.date_posted, NOW()) as minutes_ago,
                        sp.urgency,
                        COALESCE((SELECT COUNT(*) FROM PostComment WHERE post_id = sp.post_id), 0) as comments_count,
                        COALESCE(a.barangay, ?) as location
                    FROM StatusPost sp
                    LEFT JOIN Address a ON sp.user_id = a.user_id
                    WHERE (sp.urgency = 'high' OR sp.urgency = 'emergency') 
                    AND sp.status != 'Closed'
                    ORDER BY 
                        CASE sp.urgency 
                            WHEN 'emergency' THEN 1 
                            WHEN 'high' THEN 2 
                        END,
                        sp.date_posted ASC
                    LIMIT 5
                `, [barangay]);
                
                urgentIssues = urgentIssuesData.map(issue => ({
                    id: issue.id,
                    title: issue.title,
                    description: issue.description ? issue.description.substring(0, 100) : '',
                    time_ago: formatTimeAgo(issue.minutes_ago),
                    urgency: issue.urgency,
                    location: issue.location || barangay,
                    comments: issue.comments_count
                }));
            } catch (err) {
                console.error('Error fetching urgent issues:', err.message);
            }
            
            // ========== SYSTEM STATS ==========
            try {
                const [activeUsersResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM User 
                    WHERE last_login > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                `);
                systemStats.activeUsers = activeUsersResult[0]?.count || 0;
                systemStats.serverUptime = process.uptime();
                
                // Optional: Get chatbot stats if table exists
                try {
                    const [chatbotStats] = await db.execute(`
                        SELECT AVG(response_time) as avg_response_time
                        FROM ChatbotLog 
                        WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                    `);
                    if (chatbotStats[0]?.avg_response_time) {
                        systemStats.responseTime = Math.floor(chatbotStats[0].avg_response_time);
                        systemStats.chatbotLoad = systemStats.responseTime < 1000 ? 'Normal' : 'High';
                    }
                } catch (err) {
                    // ChatbotLog table might not exist yet
                    console.log('ChatbotLog table not found, using default values');
                }
            } catch (err) {
                console.error('Error fetching system stats:', err.message);
            }
            
            // ========== RECENT MODERATOR ACTIVITY ==========
            try {
                const [recentActivityData] = await db.execute(`
                    SELECT 
                        ma.action,
                        ma.details,
                        ma.created_at,
                        CONCAT(u.first_name, ' ', u.last_name) as moderator_name
                    FROM ModeratorAction ma
                    JOIN User u ON ma.moderator_id = u.user_id
                    ORDER BY ma.created_at DESC
                    LIMIT 5
                `);
                
                recentActivity = recentActivityData.map(activity => ({
                    action: activity.action,
                    details: activity.details,
                    moderator: activity.moderator_name,
                    time_ago: moment(activity.created_at).fromNow()
                }));
            } catch (err) {
                console.error('Error fetching recent activity:', err.message);
                // ModeratorAction table might not exist yet, that's okay
            }
            
            // ========== RENDER DASHBOARD ==========
            try {
                res.render('Dashboard_mod', {
                    title: 'Moderator Dashboard - BarangChan',
                    user: req.session.user,
                    currentPath: '/moderator/dashboard',
                    stats: stats,
                    chartData: chartData,
                    recentRequests: recentRequests,
                    pendingPosts: pendingPosts,
                    urgentIssues: urgentIssues,
                    recentActivity: recentActivity,
                    systemStats: systemStats,
                    success: req.session.success,
                    error: req.session.error
                });
            } catch (renderErr) {
                console.error('Error rendering template:', renderErr);
                // Fallback to simple error page
                res.status(500).send(`
                    <h1>Dashboard Error</h1>
                    <p>There was an error loading the dashboard.</p>
                    <p>Error: ${renderErr.message}</p>
                    <p><a href="/">Go to Home</a></p>
                `);
            }
            
            // Clear session messages
            delete req.session.success;
            delete req.session.error;
            
        } catch (error) {
            console.error('Critical error in moderator dashboard:', error);
            res.status(500).send(`
                <h1>Dashboard Error</h1>
                <p>There was a critical error loading the dashboard.</p>
                <p>Error: ${error.message}</p>
                <p><a href="/">Go to Home</a></p>
            `);
        }
    }
    
    // Get all posts for moderation
    static async getPosts(req, res) {
        try {
            if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
                return res.status(403).send('Access denied.');
            }
            
            const { status, type, urgency, page = 1 } = req.query;
            const limit = 20;
            const offset = (page - 1) * limit;
            
            let whereClause = 'WHERE 1=1';
            const params = [];
            
            if (status && status !== 'all') {
                whereClause += ' AND sp.status = ?';
                params.push(status);
            }
            
            if (type && type !== 'all') {
                whereClause += ' AND sp.type = ?';
                params.push(type);
            }
            
            if (urgency && urgency !== 'all') {
                whereClause += ' AND sp.urgency = ?';
                params.push(urgency);
            }
            
            // Get total count
            const [countResult] = await db.execute(`
                SELECT COUNT(*) as total FROM StatusPost sp ${whereClause}
            `, params);
            
            const totalPosts = countResult[0].total;
            const totalPages = Math.ceil(totalPosts / limit);
            
            // Get posts
            const [posts] = await db.execute(`
                SELECT 
                    sp.*,
                    CONCAT(u.first_name, ' ', u.last_name) as author_name,
                    u.email as author_email,
                    a.barangay as author_barangay,
                    (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) as reports_count,
                    (SELECT COUNT(*) FROM PostComment WHERE post_id = sp.post_id) as comments_count
                FROM StatusPost sp
                JOIN User u ON sp.user_id = u.user_id
                LEFT JOIN Address a ON u.user_id = a.user_id
                ${whereClause}
                ORDER BY 
                    CASE sp.urgency 
                        WHEN 'emergency' THEN 1 
                        WHEN 'high' THEN 2 
                        ELSE 3 
                    END,
                    sp.date_posted DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);
            
            res.render('posts_mod', {
                title: 'Moderate Posts - BarangChan',
                user: req.session.user,
                posts: posts,
                totalPosts: totalPosts,
                totalPages: totalPages,
                currentPage: parseInt(page),
                query: req.query,
                success: req.session.success,
                error: req.session.error
            });
            
            delete req.session.success;
            delete req.session.error;
            
        } catch (error) {
            console.error('Error fetching posts:', error);
            res.status(500).send('Error loading posts');
        }
    }
    
    // Approve a post
    static async approvePost(req, res) {
        try {
            const postId = req.params.id;
            const moderatorId = req.session.user.id;
            
            await db.execute(`
                UPDATE StatusPost 
                SET status = 'Resolved', is_official = TRUE 
                WHERE post_id = ?
            `, [postId]);
            
            // Log moderator action
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'approve_post', ?, NOW())
            `, [moderatorId, `Approved post ID: ${postId}`]);
            
            req.session.success = 'Post approved successfully';
            res.redirect('back');
            
        } catch (error) {
            console.error('Error approving post:', error);
            req.session.error = 'Error approving post';
            res.redirect('back');
        }
    }
    
    // Reject/Delete a post
    static async rejectPost(req, res) {
        try {
            const postId = req.params.id;
            const moderatorId = req.session.user.id;
            const { reason } = req.body;
            
            // Archive the post instead of deleting
            await db.execute(`
                UPDATE StatusPost 
                SET status = 'Closed', is_official = FALSE 
                WHERE post_id = ?
            `, [postId]);
            
            // Log moderator action
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'reject_post', ?, NOW())
            `, [moderatorId, `Rejected post ID: ${postId}. Reason: ${reason || 'No reason provided'}`]);
            
            req.session.success = 'Post rejected successfully';
            res.redirect('back');
            
        } catch (error) {
            console.error('Error rejecting post:', error);
            req.session.error = 'Error rejecting post';
            res.redirect('back');
        }
    }
    
    // Update document request status
    static async updateRequestStatus(req, res) {
        try {
            const requestId = req.params.id;
            const { status, notes } = req.body;
            const moderatorId = req.session.user.id;
            
            await db.execute(`
                UPDATE RequestForm 
                SET status = ?, 
                    document_request = CONCAT(document_request, '\n\n[Update from Moderator ', ?, ']: ', ?)
                WHERE request_id = ?
            `, [status, moderatorId, notes || 'Status updated', requestId]);
            
            // Log to audit table
            await db.execute(`
                INSERT INTO request_audit (request_id, status, date_updated)
                VALUES (?, ?, NOW())
            `, [requestId, status]);
            
            res.json({ success: true, message: 'Request status updated' });
            
        } catch (error) {
            console.error('Error updating request:', error);
            res.status(500).json({ success: false, message: 'Error updating request' });
        }
    }
    
    // Generate weekly report
    static async generateReport(req, res) {
        try {
            const { type, format } = req.query;
            
            // Get report data based on type
            let reportData = {};
            
            if (type === 'weekly') {
                const [postsData] = await db.execute(`
                    SELECT 
                        DATE(date_posted) as date,
                        COUNT(*) as total,
                        SUM(CASE WHEN type = 'complaint' THEN 1 ELSE 0 END) as complaints,
                        SUM(CASE WHEN type = 'suggestion' THEN 1 ELSE 0 END) as suggestions,
                        SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
                    FROM StatusPost
                    WHERE date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(date_posted)
                    ORDER BY date ASC
                `);
                
                const [requestsData] = await db.execute(`
                    SELECT 
                        DATE(request_date) as date,
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                        SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) as accepted,
                        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
                    FROM RequestForm
                    WHERE request_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(request_date)
                    ORDER BY date ASC
                `);
                
                reportData = { posts: postsData, requests: requestsData };
            }
            
            res.json({
                success: true,
                report: reportData,
                generated_at: new Date()
            });
            
        } catch (error) {
            console.error('Error generating report:', error);
            res.status(500).json({ success: false, message: 'Error generating report' });
        }
    }
    
    // Get urgent issues details
    static async getUrgentIssues(req, res) {
        try {
            const [issues] = await db.execute(`
                SELECT 
                    sp.*,
                    CONCAT(u.first_name, ' ', u.last_name) as reporter,
                    a.barangay as location,
                    COUNT(DISTINCT c.comment_id) as comments,
                    (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) as reports
                FROM StatusPost sp
                JOIN User u ON sp.user_id = u.user_id
                LEFT JOIN Address a ON u.user_id = a.user_id
                LEFT JOIN PostComment c ON sp.post_id = c.post_id
                WHERE (sp.urgency = 'high' OR sp.urgency = 'emergency') 
                AND sp.status != 'Closed'
                GROUP BY sp.post_id
                ORDER BY 
                    CASE sp.urgency 
                        WHEN 'emergency' THEN 1 
                        WHEN 'high' THEN 2 
                    END,
                    sp.date_posted ASC
            `);
            
            res.json({
                success: true,
                issues: issues
            });
            
        } catch (error) {
            console.error('Error fetching urgent issues:', error);
            res.status(500).json({ success: false, message: 'Error fetching issues' });
        }
    }
}

// Helper functions
function getStatusDisplay(status) {
    switch(status?.toLowerCase()) {
        case 'pending': return 'Pending';
        case 'accepted': return 'In Progress';
        case 'processing': return 'Processing';
        case 'completed': return 'Completed';
        case 'cancelled': return 'Cancelled';
        case 'rejected': return 'Rejected';
        default: return status || 'Unknown';
    }
}

function formatTimeAgo(minutesAgo) {
    if (minutesAgo < 1) return 'just now';
    if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`;
    if (minutesAgo < 1440) {
        const hours = Math.floor(minutesAgo / 60);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(minutesAgo / 1440);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

module.exports = moderatorController;