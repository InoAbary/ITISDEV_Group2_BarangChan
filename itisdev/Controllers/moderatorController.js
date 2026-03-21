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
                resolvedIncrease: 0,
                activeRequests: 0,
                activeComplaints: 0,
                forumTopics: 0,
                avgResponseTime: 2.4,
                resolutionRate: 78,
                activeUsers: 0,
                resolvedCount: 0,
                inProgressCount: 0,
                pendingCount: 0
            };
            
            let chartData = {
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                posts: [0, 0, 0, 0, 0, 0, 0],
                requests: [0, 0, 0, 0, 0, 0, 0],
                complaints: [0, 0, 0, 0, 0, 0, 0],
                resolved: [0, 0, 0, 0, 0, 0, 0]
            };
            
            let recentRequests = [];
            let pendingPosts = [];
            let urgentIssues = [];
            let recentActivity = [];
            let posts = [];
            let recentComplaints = [];
            let topCategories = [];
            let systemStats = {
                activeUsers: 0,
                chatbotLoad: 'Normal',
                serverUptime: 0,
                responseTime: 98
            };

            // ========== FETCH ALL POSTS (FOR FEED) ==========
            try {
                const [postsData] = await db.execute(`
                    SELECT 
                        sp.post_id as id,
                        sp.user_id,
                        sp.title,
                        sp.body as content,
                        sp.status,
                        sp.type,
                        sp.urgency,
                        sp.likes_count as likes,
                        sp.comments_count as comments_count,
                        sp.shares_count as shares,
                        sp.is_official,
                        sp.date_posted as created_at,
                        u.first_name,
                        u.last_name,
                        u.role as user_role,
                        CONCAT(u.first_name, ' ', u.last_name) as user_name,
                        (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) as reports_count,
                        TIMESTAMPDIFF(MINUTE, sp.date_posted, NOW()) as minutes_ago
                    FROM StatusPost sp
                    JOIN User u ON sp.user_id = u.user_id
                    WHERE sp.status != 'Closed' OR sp.status IS NULL
                    ORDER BY 
                        CASE 
                            WHEN sp.urgency = 'emergency' THEN 1 
                            WHEN sp.urgency = 'high' THEN 2 
                            WHEN sp.status = 'Pending' THEN 3
                            ELSE 4 
                        END,
                        sp.date_posted DESC
                    LIMIT 50
                `);
                
                posts = postsData.map(post => ({
                    id: post.id,
                    user_id: post.user_id,
                    user_name: post.user_name,
                    user_role: post.user_role === 'administrator' ? 'Admin' : (post.user_role === 'moderator' ? 'Moderator' : 'Resident'),
                    title: post.title || '',
                    content: post.content || '',
                    type: post.type || 'update',
                    urgency: post.urgency || 'low',
                    status: post.status || 'Pending',
                    likes: post.likes || 0,
                    comments_count: post.comments_count || 0,
                    shares: post.shares || 0,
                    is_official: post.is_official === 1,
                    reports_count: post.reports_count || 0,
                    time_ago: moderatorController.formatTimeAgo(post.minutes_ago),
                    user_avatar: post.user_name ? post.user_name.charAt(0).toUpperCase() : 'U'
                }));
            } catch (err) {
                console.error('Error fetching posts:', err.message);
            }

            // ========== STATS CARDS DATA ==========
            try {
                // Pending posts count
                const [pendingPostsResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Pending'
                `);
                stats.pendingPosts = pendingPostsResult[0]?.count || 0;
                
                // Awaiting review posts (pending with high urgency or complaints)
                const [awaitingReviewResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE status = 'Pending' AND (type = 'complaint' OR urgency IN ('high', 'emergency'))
                `);
                stats.awaitingReview = awaitingReviewResult[0]?.count || 0;
                
                // Total document requests
                const [totalRequestsResult] = await db.execute(`SELECT COUNT(*) as count FROM RequestForm`);
                stats.totalRequests = totalRequestsResult[0]?.count || 0;
                
                // Active requests (Pending or Accepted)
                const [activeRequestsResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM RequestForm 
                    WHERE status IN ('Pending', 'Accepted')
                `);
                stats.activeRequests = activeRequestsResult[0]?.count || 0;
                stats.inProgressRequests = stats.activeRequests;
                
                // Active complaints (Under Review)
                const [activeComplaintsResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM ComplaintForm 
                    WHERE status = 'Under Review'
                `);
                stats.activeComplaints = activeComplaintsResult[0]?.count || 0;
                
                // Forum topics count
                const [forumResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM ForumTopic 
                    WHERE status = 'active'
                `);
                stats.forumTopics = forumResult[0]?.count || 0;
                
                // Urgent issues (high or emergency urgency)
                const [urgentIssuesResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost 
                    WHERE (urgency = 'high' OR urgency = 'emergency') AND status != 'Closed'
                `);
                stats.urgentIssues = urgentIssuesResult[0]?.count || 0;
                
                // Emergencies specifically
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
                
                // Resolution stats for pie chart
                const [resolvedCountResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost WHERE status = 'Resolved'
                `);
                stats.resolvedCount = resolvedCountResult[0]?.count || 0;
                
                const [inProgressCountResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost WHERE status = 'Pending'
                `);
                stats.inProgressCount = inProgressCountResult[0]?.count || 0;
                
                const [pendingCountResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM StatusPost WHERE status NOT IN ('Resolved', 'Closed')
                `);
                stats.pendingCount = pendingCountResult[0]?.count || 0;
                
                // Resolution rate calculation
                const totalResolvable = stats.resolvedCount + stats.pendingCount;
                stats.resolutionRate = totalResolvable > 0 ? Math.round((stats.resolvedCount / totalResolvable) * 100) : 0;
                
            } catch (err) {
                console.error('Error fetching stats:', err.message);
            }

            // ========== CHART DATA - FIXED WITH SEPARATE QUERIES ==========
            try {
                const dayMap = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6};
                
                // Get posts per day
                try {
                    const [postsByDay] = await db.execute(`
                        SELECT 
                            DATE(date_posted) as date,
                            DAYOFWEEK(date_posted) as day_of_week,
                            COUNT(*) as count
                        FROM StatusPost
                        WHERE date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                        GROUP BY DATE(date_posted), DAYOFWEEK(date_posted)
                    `);
                    
                    postsByDay.forEach(day => {
                        if (day.date && day.day_of_week) {
                            const index = dayMap[day.day_of_week] !== undefined ? dayMap[day.day_of_week] : 0;
                            chartData.posts[index] = day.count || 0;
                        }
                    });
                } catch (err) {
                    console.error('Error fetching posts chart data:', err.message);
                }
                
                // Get requests per day
                try {
                    const [requestsByDay] = await db.execute(`
                        SELECT 
                            DATE(request_date) as date,
                            DAYOFWEEK(request_date) as day_of_week,
                            COUNT(*) as count
                        FROM RequestForm
                        WHERE request_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                        GROUP BY DATE(request_date), DAYOFWEEK(request_date)
                    `);
                    
                    requestsByDay.forEach(day => {
                        if (day.date && day.day_of_week) {
                            const index = dayMap[day.day_of_week] !== undefined ? dayMap[day.day_of_week] : 0;
                            chartData.requests[index] = day.count || 0;
                        }
                    });
                } catch (err) {
                    console.error('Error fetching requests chart data:', err.message);
                }
                
                // Get complaints per day
                try {
                    const [complaintsByDay] = await db.execute(`
                        SELECT 
                            DATE(complaint_date) as date,
                            DAYOFWEEK(complaint_date) as day_of_week,
                            COUNT(*) as count
                        FROM ComplaintForm
                        WHERE complaint_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                        GROUP BY DATE(complaint_date), DAYOFWEEK(complaint_date)
                    `);
                    
                    complaintsByDay.forEach(day => {
                        if (day.date && day.day_of_week) {
                            const index = dayMap[day.day_of_week] !== undefined ? dayMap[day.day_of_week] : 0;
                            chartData.complaints[index] = day.count || 0;
                        }
                    });
                } catch (err) {
                    console.error('Error fetching complaints chart data:', err.message);
                }
                
                // Get resolved per day
                try {
                    const [resolvedByDay] = await db.execute(`
                        SELECT 
                            DATE(date_posted) as date,
                            DAYOFWEEK(date_posted) as day_of_week,
                            COUNT(*) as count
                        FROM StatusPost
                        WHERE status = 'Resolved' AND date_posted >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                        GROUP BY DATE(date_posted), DAYOFWEEK(date_posted)
                    `);
                    
                    resolvedByDay.forEach(day => {
                        if (day.date && day.day_of_week) {
                            const index = dayMap[day.day_of_week] !== undefined ? dayMap[day.day_of_week] : 0;
                            chartData.resolved[index] = day.count || 0;
                        }
                    });
                } catch (err) {
                    console.error('Error fetching resolved chart data:', err.message);
                }
                
            } catch (err) {
                console.error('Error in chart data processing:', err.message);
            }

            // ========== TOP CATEGORIES ==========
            try {
                const [categoriesData] = await db.execute(`
                    SELECT 
                        CASE 
                            WHEN type = 'complaint' THEN 'Complaints'
                            WHEN type = 'suggestion' THEN 'Suggestions'
                            WHEN type = 'query' THEN 'Queries'
                            WHEN type = 'update' THEN 'Updates'
                            WHEN type = 'announcement' THEN 'Announcements'
                            WHEN type = 'emergency' THEN 'Emergencies'
                            ELSE type
                        END as name,
                        COUNT(*) as count
                    FROM StatusPost
                    WHERE date_posted >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                    GROUP BY type
                    ORDER BY count DESC
                    LIMIT 5
                `);
                
                const totalCategories = categoriesData.reduce((sum, cat) => sum + cat.count, 0);
                topCategories = categoriesData.map(cat => ({
                    name: cat.name.charAt(0).toUpperCase() + cat.name.slice(1),
                    count: cat.count,
                    percentage: totalCategories > 0 ? Math.round((cat.count / totalCategories) * 100) : 0
                }));
            } catch (err) {
                console.error('Error fetching top categories:', err.message);
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
                    LIMIT 10
                `);
                
                recentRequests = recentRequestsData.map(req => ({
                    id: req.reference_number,
                    resident: req.resident || 'Unknown',
                    type: req.document_type ? (req.document_type.length > 50 ? req.document_type.substring(0, 50) + '...' : req.document_type) : 'Document Request',
                    date: req.date ? moment(req.date).format('MMM DD, YYYY') : 'N/A',
                    status: moderatorController.getStatusClass(req.status),
                    statusDisplay: moderatorController.getStatusDisplay(req.status),
                    original_id: req.id
                }));
            } catch (err) {
                console.error('Error fetching recent requests:', err.message);
            }
            
            // ========== RECENT COMPLAINTS ==========
            try {
                const [recentComplaintsData] = await db.execute(`
                    SELECT 
                        cf.complaint_id as id,
                        COALESCE(CONCAT(u.first_name, ' ', u.last_name), cf.name) as complainant,
                        cf.allegations as type,
                        DATE(cf.complaint_date) as date,
                        cf.status
                    FROM ComplaintForm cf
                    LEFT JOIN User u ON cf.user_id = u.user_id
                    ORDER BY cf.complaint_date DESC
                    LIMIT 10
                `);
                
                recentComplaints = recentComplaintsData.map(comp => ({
                    id: comp.id,
                    complainant: comp.complainant || 'Anonymous',
                    type: comp.type ? (comp.type.length > 50 ? comp.type.substring(0, 50) + '...' : comp.type) : 'General Complaint',
                    date: comp.date ? moment(comp.date).format('MMM DD, YYYY') : 'N/A',
                    status: moderatorController.getStatusClass(comp.status),
                    statusDisplay: comp.status || 'Under Review',
                    original_id: comp.id
                }));
            } catch (err) {
                console.error('Error fetching recent complaints:', err.message);
            }
            
            // ========== PENDING POSTS (for sidebar) ==========
            try {
                const [pendingPostsData] = await db.execute(`
                    SELECT 
                        sp.post_id as id,
                        CONCAT(u.first_name, ' ', u.last_name) as author,
                        sp.title,
                        sp.body as content,
                        TIMESTAMPDIFF(MINUTE, sp.date_posted, NOW()) as minutes_ago,
                        sp.urgency,
                        COALESCE((SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id), 0) as reports_count
                    FROM StatusPost sp
                    JOIN User u ON sp.user_id = u.user_id
                    WHERE sp.status = 'Pending'
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
                    title: post.title || '',
                    content: post.content ? post.content.substring(0, 150) : '',
                    time_ago: moderatorController.formatTimeAgo(post.minutes_ago),
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
                    AND sp.status NOT IN ('Closed', 'Resolved')
                    ORDER BY 
                        CASE sp.urgency 
                            WHEN 'emergency' THEN 1 
                            WHEN 'high' THEN 2 
                        END,
                        sp.date_posted ASC
                    LIMIT 10
                `, [barangay]);
                
                urgentIssues = urgentIssuesData.map(issue => ({
                    id: issue.id,
                    title: issue.title,
                    description: issue.description ? issue.description.substring(0, 100) : '',
                    time_ago: moderatorController.formatTimeAgo(issue.minutes_ago),
                    urgency: issue.urgency,
                    location: issue.location || barangay,
                    comments: issue.comments_count
                }));
            } catch (err) {
                console.error('Error fetching urgent issues:', err.message);
            }
            
            // ========== RECENT MODERATOR ACTIVITY ==========
            try {
                const [recentActivityData] = await db.execute(`
                    SELECT 
                        ma.action,
                        ma.details,
                        ma.created_at,
                        CONCAT(u.first_name, ' ', u.last_name) as moderator_name,
                        TIMESTAMPDIFF(MINUTE, ma.created_at, NOW()) as minutes_ago
                    FROM ModeratorAction ma
                    JOIN User u ON ma.moderator_id = u.user_id
                    ORDER BY ma.created_at DESC
                    LIMIT 10
                `);
                
                recentActivity = recentActivityData.map(activity => ({
                    action: activity.action,
                    details: activity.details,
                    moderator: activity.moderator_name,
                    time_ago: moderatorController.formatTimeAgo(activity.minutes_ago)
                }));
            } catch (err) {
                console.error('Error fetching recent activity:', err.message);
            }
            
            // ========== SYSTEM STATS ==========
            try {
                const [activeUsersResult] = await db.execute(`
                    SELECT COUNT(*) as count FROM User 
                    WHERE last_login > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                `);
                systemStats.activeUsers = activeUsersResult[0]?.count || 0;
                stats.activeUsers = systemStats.activeUsers;
                systemStats.serverUptime = Math.floor(process.uptime() / 60);
                
                // Calculate average response time from resolved items
                try {
                    const [avgResponseResult] = await db.execute(`
                        SELECT AVG(TIMESTAMPDIFF(HOUR, date_posted, NOW())) as avg_hours
                        FROM StatusPost 
                        WHERE status = 'Resolved' 
                        AND date_posted > DATE_SUB(NOW(), INTERVAL 30 DAY)
                    `);
                    if (avgResponseResult[0]?.avg_hours) {
                        stats.avgResponseTime = Math.round(avgResponseResult[0].avg_hours * 10) / 10;
                    }
                } catch (err) {
                    console.log('Error calculating response time:', err.message);
                }
                
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
                }
            } catch (err) {
                console.error('Error fetching system stats:', err.message);
            }
            
            // ========== RENDER DASHBOARD ==========
            try {
                res.render('Dashboard_mod', {
                    title: 'Moderator Dashboard - BarangChan',
                    user: req.session.user,
                    currentPath: '/moderator/dashboard',
                    stats: stats,
                    chartData: chartData,
                    posts: posts,
                    recentRequests: recentRequests,
                    recentComplaints: recentComplaints,
                    pendingPosts: pendingPosts,
                    urgentIssues: urgentIssues,
                    recentActivity: recentActivity,
                    topCategories: topCategories,
                    systemStats: systemStats,
                    success: req.session.success,
                    error: req.session.error
                });
            } catch (renderErr) {
                console.error('Error rendering template:', renderErr);
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
    
    // Get all posts for moderation with proper schema arguments
    // Get all posts for moderation with proper schema arguments
static async getPosts(req, res) {
    try {
        if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
            return res.status(403).send('Access denied.');
        }
        
        // Get filter parameters from query string - matching schema ENUM values
        const { 
            status,      // ENUM: 'Pending', 'Resolved', 'Closed'
            type,        // ENUM: 'update', 'query', 'suggestion', 'complaint', 'announcement', 'emergency'
            urgency,     // ENUM: 'low', 'medium', 'high', 'emergency'
            page = 1,
            search,
            barangay,
            sort = 'latest'
        } = req.query;
        
        const limit = 20;
        const offset = (parseInt(page) - 1) * limit;
        
        // Build WHERE clause
        const whereConditions = [];
        const params = [];
        
        // Filter by status
        if (status && status !== 'all') {
            whereConditions.push('sp.status = ?');
            params.push(status);
        }
        
        // Filter by type
        if (type && type !== 'all') {
            whereConditions.push('sp.type = ?');
            params.push(type);
        }
        
        // Filter by urgency
        if (urgency && urgency !== 'all') {
            whereConditions.push('sp.urgency = ?');
            params.push(urgency);
        }
        
        // Search by title or content
        if (search && search.trim() !== '') {
            whereConditions.push('(sp.title LIKE ? OR sp.body LIKE ?)');
            const searchTerm = `%${search.trim()}%`;
            params.push(searchTerm, searchTerm);
        }
        
        // Filter by barangay
        if (barangay && barangay !== 'all') {
            whereConditions.push('a.barangay = ?');
            params.push(barangay);
        }
        
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';
        
        // Get total count with filters
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM StatusPost sp
            LEFT JOIN User u ON sp.user_id = u.user_id
            LEFT JOIN Address a ON u.user_id = a.user_id
            ${whereClause}
        `;
        
        console.log('[getPosts] params count:', params.length, '| whereClause empty:', whereClause === '');
        let countResult;
        if (params.length > 0) {
            console.log('[getPosts] count query WITH params');
            [countResult] = await db.execute(countQuery, params);
        } else {
            console.log('[getPosts] count query WITHOUT params');
            [countResult] = await db.execute(countQuery);
        }
        console.log('[getPosts] count OK:', countResult[0].total);
        
        const totalPosts = countResult[0].total;
        const totalPages = Math.ceil(totalPosts / limit);
        
        // Build ORDER BY
        let orderByClause = '';
        switch(sort) {
            case 'latest':
                orderByClause = 'ORDER BY sp.date_posted DESC';
                break;
            case 'oldest':
                orderByClause = 'ORDER BY sp.date_posted ASC';
                break;
            case 'most_urgent':
                orderByClause = `
                    ORDER BY 
                        CASE sp.urgency 
                            WHEN 'emergency' THEN 1 
                            WHEN 'high' THEN 2 
                            WHEN 'medium' THEN 3 
                            WHEN 'low' THEN 4 
                            ELSE 5 
                        END,
                        sp.date_posted DESC
                `;
                break;
            case 'most_reported':
                orderByClause = `
                    ORDER BY 
                        (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) DESC,
                        sp.date_posted DESC
                `;
                break;
            case 'most_commented':
                orderByClause = `
                    ORDER BY 
                        sp.comments_count DESC,
                        sp.date_posted DESC
                `;
                break;
            case 'most_liked':
                orderByClause = `
                    ORDER BY 
                        sp.likes_count DESC,
                        sp.date_posted DESC
                `;
                break;
            default:
                orderByClause = 'ORDER BY sp.date_posted DESC';
        }
        
        // Main query — LIMIT/OFFSET inlined as integers to avoid mysql2 prepared-statement type error
        const query = `
            SELECT 
                sp.post_id as id,
                sp.user_id,
                sp.title,
                sp.body as content,
                sp.status,
                sp.type,
                sp.urgency,
                sp.likes_count as likes,
                sp.comments_count as comments_count,
                sp.shares_count as shares,
                sp.is_official,
                sp.date_posted as created_at,
                u.first_name,
                u.last_name,
                u.email,
                u.role as user_role,
                a.barangay,
                a.city,
                a.street,
                a.zip,
                (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) as reports_count,
                (SELECT COUNT(*) FROM PostComment WHERE post_id = sp.post_id) as actual_comments_count,
                TIMESTAMPDIFF(MINUTE, sp.date_posted, NOW()) as minutes_ago
            FROM StatusPost sp
            LEFT JOIN User u ON sp.user_id = u.user_id
            LEFT JOIN Address a ON u.user_id = a.user_id
            ${whereClause}
            ${orderByClause}
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
        
        console.log('[getPosts] executing main query, params.length:', params.length);
        let posts;
        if (params.length > 0) {
            [posts] = await db.execute(query, params);
        } else {
            [posts] = await db.execute(query);
        }
        console.log('[getPosts] main query OK, rows:', posts.length);
        
        // Format posts for display
        const formattedPosts = posts.map(post => ({
            id: post.id,
            user_id: post.user_id,
            author_name: post.first_name && post.last_name ? `${post.first_name} ${post.last_name}` : 'Unknown User',
            author_email: post.email,
            barangay: post.barangay || 'Not specified',
            title: post.title || '',
            content: post.content || '',
            status: post.status || 'Pending',
            type: post.type || 'update',
            urgency: post.urgency || 'low',
            likes: post.likes || 0,
            comments_count: post.comments_count || 0,
            actual_comments_count: post.actual_comments_count || 0,
            shares: post.shares || 0,
            is_official: post.is_official === 1,
            reports_count: post.reports_count || 0,
            created_at: post.created_at,
            time_ago: moderatorController.formatTimeAgo(post.minutes_ago),
            user_avatar: post.first_name ? post.first_name.charAt(0).toUpperCase() : 'U'
        }));
        
        // Get all available barangays for filter dropdown
        let barangays = [];
        try {
            console.log('[getPosts] fetching barangays');
            const [barangayList] = await db.execute(`
                SELECT DISTINCT barangay 
                FROM Address 
                WHERE barangay IS NOT NULL AND barangay != ''
                ORDER BY barangay
            `);
            console.log('[getPosts] barangays OK');
            barangays = barangayList.map(b => b.barangay);
        } catch (err) {
            console.error('Error fetching barangays:', err.message);
        }
        
        // Get filter options for counts
        let statusCounts = [];
        let typeCounts = [];
        let urgencyCounts = [];
        
        try {
            [statusCounts] = await db.execute(`
                SELECT status, COUNT(*) as count 
                FROM StatusPost 
                GROUP BY status
            `);
        } catch (err) {
            console.error('Error fetching status counts:', err.message);
        }
        
        try {
            [typeCounts] = await db.execute(`
                SELECT type, COUNT(*) as count 
                FROM StatusPost 
                GROUP BY type
            `);
        } catch (err) {
            console.error('Error fetching type counts:', err.message);
        }
        
        try {
            [urgencyCounts] = await db.execute(`
                SELECT urgency, COUNT(*) as count 
                FROM StatusPost 
                GROUP BY urgency
            `);
        } catch (err) {
            console.error('Error fetching urgency counts:', err.message);
        }
        
        res.render('posts_mod', {
            title: 'Moderate Posts - BarangChan',
            user: req.session.user,
            posts: formattedPosts,
            totalPosts: totalPosts,
            totalPages: totalPages,
            currentPage: parseInt(page),
            limit: limit,
            query: req.query,
            statusCounts: statusCounts,
            typeCounts: typeCounts,
            urgencyCounts: urgencyCounts,
            barangays: barangays,
            success: req.session.success,
            error: req.session.error
        });
        
        delete req.session.success;
        delete req.session.error;
        
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).send(`
            <h1>Error Loading Posts</h1>
            <p>There was an error loading the posts management page.</p>
            <p>Error: ${error.message}</p>
            <p>SQL Message: ${error.sqlMessage || 'N/A'}</p>
            <p><a href="/moderator/dashboard">Return to Dashboard</a></p>
        `);
    }
}

    // Get document requests for moderation with proper schema arguments
    static async getRequests(req, res) {
        try {
            if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
                return res.status(403).send('Access denied.');
            }
            
            // Get filter parameters - matching RequestForm schema ENUM: 'Pending', 'Accepted', 'Cancelled'
            const { 
                status,      // ENUM: 'Pending', 'Accepted', 'Cancelled'
                search,
                barangay,
                date_from,
                date_to,
                page = 1,
                sort = 'latest'
            } = req.query;
            
            const limit = 20;
            const offset = (parseInt(page) - 1) * limit;
            
            // Build WHERE clause
            let whereClause = 'WHERE 1=1';
            const params = [];
            
            // Filter by status (matches RequestForm.status ENUM)
            if (status && status !== 'all') {
                whereClause += ' AND r.status = ?';
                params.push(status);
            }
            
            // Search by name or document type
            if (search && search.trim() !== '') {
                whereClause += ' AND (r.name LIKE ? OR r.document_request LIKE ?)';
                const searchTerm = `%${search.trim()}%`;
                params.push(searchTerm, searchTerm);
            }
            
            // Filter by barangay (from Address table)
            if (barangay && barangay !== 'all') {
                whereClause += ' AND a.barangay = ?';
                params.push(barangay);
            }
            
            // Filter by date range
            if (date_from) {
                whereClause += ' AND DATE(r.request_date) >= ?';
                params.push(date_from);
            }
            
            if (date_to) {
                whereClause += ' AND DATE(r.request_date) <= ?';
                params.push(date_to);
            }
            
            // Get total count with filters
            let countQuery = `
                SELECT COUNT(*) as total 
                FROM RequestForm r
                LEFT JOIN User u ON r.user_id = u.user_id
                LEFT JOIN Address a ON u.user_id = a.user_id
                ${whereClause}
            `;
            
            const [countResult] = params.length > 0
                ? await db.execute(countQuery, params)
                : await db.execute(countQuery);
            const totalRequests = countResult[0].total;
            const totalPages = Math.ceil(totalRequests / limit);
            
            // Build ORDER BY
            let orderByClause = '';
            switch(sort) {
                case 'latest':
                    orderByClause = 'ORDER BY r.request_date DESC';
                    break;
                case 'oldest':
                    orderByClause = 'ORDER BY r.request_date ASC';
                    break;
                case 'pending_first':
                    orderByClause = `
                        ORDER BY 
                            CASE r.status 
                                WHEN 'Pending' THEN 1 
                                WHEN 'Accepted' THEN 2 
                                WHEN 'Cancelled' THEN 3 
                                ELSE 4 
                            END,
                            r.request_date DESC
                    `;
                    break;
                default:
                    orderByClause = 'ORDER BY r.request_date DESC';
            }
            
            // Main query with all RequestForm fields
            const query = `
                SELECT 
                    r.request_id as id,
                    r.user_id,
                    r.email,
                    r.phone,
                    r.name as requester_name,
                    r.address as requester_address,
                    r.document_request,
                    r.status,
                    r.request_date,
                    u.first_name,
                    u.last_name,
                    u.username,
                    u.email as user_email,
                    u.phone as user_phone,
                    a.barangay,
                    a.city,
                    a.street,
                    a.zip,
                    (SELECT COUNT(*) FROM RequestFile WHERE request_id = r.request_id) as file_count,
                    TIMESTAMPDIFF(DAY, r.request_date, NOW()) as days_pending,
                    CONCAT('REQ-', r.request_id, '-', YEAR(r.request_date)) as reference_number
                FROM RequestForm r
                LEFT JOIN User u ON r.user_id = u.user_id
                LEFT JOIN Address a ON u.user_id = a.user_id
                ${whereClause}
                ${orderByClause}
                LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
            `;
            
            // Execute with filter params only (LIMIT/OFFSET are inlined)
            const [requests] = params.length > 0
                ? await db.execute(query, params)
                : await db.execute(query);
            
            // Format requests for display
            const formattedRequests = requests.map(req => ({
                id: req.id,
                reference_number: req.reference_number,
                user_id: req.user_id,
                requester_name: req.requester_name || (req.first_name ? `${req.first_name} ${req.last_name}` : 'Unknown'),
                email: req.email || req.user_email,
                phone: req.phone || req.user_phone,
                address: req.requester_address,
                barangay: req.barangay || 'Not specified',
                city: req.city || 'Baliuag',
                document_request: req.document_request,
                document_type: req.document_request ? req.document_request.split('\n')[0] : 'Document Request',
                status: req.status || 'Pending',
                status_display: moderatorController.getStatusDisplay(req.status),
                status_class: moderatorController.getStatusClass(req.status),
                request_date: req.request_date,
                formatted_date: req.request_date ? moment(req.request_date).format('MMM DD, YYYY') : 'N/A',
                days_pending: req.days_pending || 0,
                file_count: req.file_count || 0,
                created_at: req.request_date,
                time_ago: req.request_date ? moment(req.request_date).fromNow() : 'N/A'
            }));
            
            // Get all available barangays for filter dropdown
            let barangays = [];
            try {
                const [barangayList] = await db.execute(`
                    SELECT DISTINCT barangay 
                    FROM Address 
                    WHERE barangay IS NOT NULL AND barangay != ''
                    ORDER BY barangay
                `);
                barangays = barangayList.map(b => b.barangay);
            } catch (err) {
                console.error('Error fetching barangays:', err.message);
            }
            
            // Get status counts for filter badges
            const [statusCounts] = await db.execute(`
                SELECT status, COUNT(*) as count 
                FROM RequestForm 
                GROUP BY status
            `);
            
            // Get monthly request counts for chart
            const [monthlyCounts] = await db.execute(`
                SELECT 
                    DATE_FORMAT(request_date, '%b') as month,
                    COUNT(*) as count,
                    SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
                FROM RequestForm
                WHERE request_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(request_date, '%Y-%m'), DATE_FORMAT(request_date, '%b')
                ORDER BY DATE_FORMAT(request_date, '%Y-%m') ASC
            `);
            
            // Get most requested document types
            const [topDocuments] = await db.execute(`
                SELECT 
                    CASE 
                        WHEN document_request LIKE '%Barangay Clearance%' THEN 'Barangay Clearance'
                        WHEN document_request LIKE '%Business Permit%' THEN 'Business Permit'
                        WHEN document_request LIKE '%Certificate of Indigency%' THEN 'Certificate of Indigency'
                        WHEN document_request LIKE '%Certificate of Residency%' THEN 'Certificate of Residency'
                        WHEN document_request LIKE '%Cedula%' OR document_request LIKE '%Community Tax%' THEN 'Cedula'
                        WHEN document_request LIKE '%Barangay ID%' THEN 'Barangay ID'
                        ELSE 'Other Documents'
                    END as document_type,
                    COUNT(*) as count
                FROM RequestForm
                WHERE request_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY document_type
                ORDER BY count DESC
                LIMIT 5
            `);
            
            res.render('requests_mod', {
                title: 'Document Requests - BarangChan',
                user: req.session.user,
                requests: formattedRequests,
                totalRequests: totalRequests,
                totalPages: totalPages,
                currentPage: parseInt(page),
                limit: limit,
                query: req.query,
                statusCounts: statusCounts,
                monthlyCounts: monthlyCounts,
                topDocuments: topDocuments,
                barangays: barangays,
                success: req.session.success,
                error: req.session.error
            });
            
            delete req.session.success;
            delete req.session.error;
            
        } catch (error) {
            console.error('Error fetching requests:', error);
            res.status(500).send(`
                <h1>Error Loading Requests</h1>
                <p>There was an error loading the document requests page.</p>
                <p>Error: ${error.message}</p>
                <p><a href="/moderator/dashboard">Return to Dashboard</a></p>
            `);
        }
    }
    
    // Get help desk tickets
    static async getHelpDesk(req, res) {
        try {
            if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
                return res.status(403).send('Access denied.');
            }
            
            // Fetch recent chatbot interactions or support tickets
            const [tickets] = await db.execute(`
                SELECT cl.*, CONCAT(u.first_name, ' ', u.last_name) as user_name,
                       u.email as user_email,
                       TIMESTAMPDIFF(MINUTE, cl.created_at, NOW()) as minutes_ago
                FROM ChatbotLog cl
                LEFT JOIN User u ON cl.user_id = u.user_id
                ORDER BY cl.created_at DESC
                LIMIT 50
            `);
            
            const formattedTickets = tickets.map(ticket => ({
                ...ticket,
                time_ago: moderatorController.formatTimeAgo(ticket.minutes_ago)
            }));
            
            res.render('help_desk_mod', {
                title: 'Help Desk - BarangChan',
                user: req.session.user,
                tickets: formattedTickets,
                success: req.session.success,
                error: req.session.error
            });
            
            delete req.session.success;
            delete req.session.error;
            
        } catch (error) {
            console.error('Error fetching help desk:', error);
            res.status(500).send(`
                <h1>Error Loading Help Desk</h1>
                <p>Error: ${error.message}</p>
                <p><a href="/moderator/dashboard">Return to Dashboard</a></p>
            `);
        }
    }
    
    // Create announcement post
    static async createAnnouncement(req, res) {
        try {
            if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
            
            const { title, content, type, urgency } = req.body;
            const userId = req.session.user.id;
            
            await db.execute(`
                INSERT INTO StatusPost (user_id, title, body, type, urgency, status, is_official, date_posted)
                VALUES (?, ?, ?, ?, ?, 'Resolved', TRUE, NOW())
            `, [userId, title || null, content, type || 'announcement', urgency || 'low']);
            
            // Log moderator action
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'create_announcement', ?, NOW())
            `, [userId, `Created announcement: ${title || content.substring(0, 50)}`]);
            
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.json({ success: true, message: 'Announcement posted successfully' });
            } else {
                req.session.success = 'Announcement posted successfully';
                res.redirect('/moderator/dashboard');
            }
            
        } catch (error) {
            console.error('Error creating announcement:', error);
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.status(500).json({ success: false, message: 'Error creating announcement' });
            } else {
                req.session.error = 'Error creating announcement';
                res.redirect('/moderator/dashboard');
            }
        }
    }
    
    // Approve a post
    static async approvePost(req, res) {
        try {
            const postId = req.params.id;
            const moderatorId = req.session.user.id;
            
            // Get post details before updating
            const [post] = await db.execute(`
                SELECT title, body FROM StatusPost WHERE post_id = ?
            `, [postId]);
            
            await db.execute(`
                UPDATE StatusPost 
                SET status = 'Resolved', is_official = TRUE 
                WHERE post_id = ?
            `, [postId]);
            
            // Log moderator action
            const postTitle = post[0]?.title || post[0]?.body?.substring(0, 50) || 'Post';
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'approve_post', ?, NOW())
            `, [moderatorId, `Approved post: ${postTitle}`]);
            
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.json({ success: true, message: 'Post approved successfully' });
            } else {
                req.session.success = 'Post approved successfully';
                res.redirect('back');
            }
            
        } catch (error) {
            console.error('Error approving post:', error);
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.status(500).json({ success: false, message: 'Error approving post' });
            } else {
                req.session.error = 'Error approving post';
                res.redirect('back');
            }
        }
    }
    
    // Reject/Delete a post
    static async rejectPost(req, res) {
        try {
            const postId = req.params.id;
            const moderatorId = req.session.user.id;
            const { reason } = req.body;
            
            // Get post details before updating
            const [post] = await db.execute(`
                SELECT title, body FROM StatusPost WHERE post_id = ?
            `, [postId]);
            
            // Archive the post instead of deleting
            await db.execute(`
                UPDATE StatusPost 
                SET status = 'Closed', is_official = FALSE 
                WHERE post_id = ?
            `, [postId]);
            
            // Log moderator action
            const postTitle = post[0]?.title || post[0]?.body?.substring(0, 50) || 'Post';
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'reject_post', ?, NOW())
            `, [moderatorId, `Rejected post: ${postTitle}. Reason: ${reason || 'No reason provided'}`]);
            
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.json({ success: true, message: 'Post rejected successfully' });
            } else {
                req.session.success = 'Post rejected successfully';
                res.redirect('back');
            }
            
        } catch (error) {
            console.error('Error rejecting post:', error);
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                res.status(500).json({ success: false, message: 'Error rejecting post' });
            } else {
                req.session.error = 'Error rejecting post';
                res.redirect('back');
            }
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
                SET status = ?
                WHERE request_id = ?
            `, [status, requestId]);
            
            // Log to audit table
            await db.execute(`
                INSERT INTO request_audit (request_id, status, date_updated)
                VALUES (?, ?, NOW())
            `, [requestId, status]);
            
            // Log moderator action
            await db.execute(`
                INSERT INTO ModeratorAction (moderator_id, action, details, created_at)
                VALUES (?, 'update_request', ?, NOW())
            `, [moderatorId, `Updated request ID: ${requestId} to status: ${status}. Notes: ${notes || 'None'}`]);
            
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
                    ORDER BY DATE(date_posted) ASC
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
                    ORDER BY DATE(request_date) ASC
                `);
                
                const [complaintsData] = await db.execute(`
                    SELECT 
                        DATE(complaint_date) as date,
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
                        SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
                    FROM ComplaintForm
                    WHERE complaint_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    GROUP BY DATE(complaint_date)
                    ORDER BY DATE(complaint_date) ASC
                `);
                
                reportData = { posts: postsData, requests: requestsData, complaints: complaintsData };
            }
            
            if (format === 'json') {
                res.json({
                    success: true,
                    report: reportData,
                    generated_at: new Date()
                });
            } else {
                res.render('reports', {
                    title: 'Moderator Reports - BarangChan',
                    user: req.session.user,
                    reportData: reportData,
                    type: type || 'weekly'
                });
            }
            
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
                    (SELECT COUNT(*) FROM PostComment WHERE post_id = sp.post_id) as comments,
                    (SELECT COUNT(*) FROM PostReport WHERE post_id = sp.post_id) as reports
                FROM StatusPost sp
                JOIN User u ON sp.user_id = u.user_id
                LEFT JOIN Address a ON u.user_id = a.user_id
                WHERE (sp.urgency = 'high' OR sp.urgency = 'emergency') 
                AND sp.status != 'Closed'
                ORDER BY 
                    CASE sp.urgency 
                        WHEN 'emergency' THEN 1 
                        WHEN 'high' THEN 2 
                    END,
                    sp.date_posted ASC
                LIMIT 20
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
    
    // Helper function to get status display text
    static getStatusDisplay(status) {
        switch(status?.toLowerCase()) {
            case 'pending': return 'Pending';
            case 'accepted': return 'In Progress';
            case 'processing': return 'Processing';
            case 'completed': return 'Completed';
            case 'cancelled': return 'Cancelled';
            case 'rejected': return 'Rejected';
            case 'under review': return 'Under Review';
            case 'resolved': return 'Resolved';
            case 'closed': return 'Closed';
            default: return status || 'Unknown';
        }
    }
    
    // Helper function to get status CSS class
    static getStatusClass(status) {
        switch(status?.toLowerCase()) {
            case 'pending': return 'pending';
            case 'accepted': return 'accepted';
            case 'processing': return 'accepted';
            case 'completed': return 'completed';
            case 'cancelled': return 'cancelled';
            case 'rejected': return 'cancelled';
            case 'under review': return 'under-review';
            case 'resolved': return 'resolved';
            case 'closed': return 'closed';
            default: return 'pending';
        }
    }
    
    // Helper function to format time ago
    static formatTimeAgo(minutesAgo) {
        if (!minutesAgo && minutesAgo !== 0) return 'Just now';
        if (minutesAgo < 1) return 'Just now';
        if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`;
        if (minutesAgo < 1440) {
            const hours = Math.floor(minutesAgo / 60);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        const days = Math.floor(minutesAgo / 1440);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}

module.exports = moderatorController;