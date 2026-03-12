// app.js - BarangChan Main Application File (No Database Version)
require("dotenv").config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt')

const conn = require('./config/db')

const app = express();
const PORT = process.env.PORT || 3000;




// ==================== IN-MEMORY STORAGE (代替数据库) ====================
// This simulates a database - data will be lost when server restarts
const users = [
    {
        id: 1,
        full_name: 'Juan Dela Cruz',
        email: 'resident@barangchan.ph',
        password: 'resident123', // In production, use bcrypt
        birthday: '1990-01-15',
        role: 'resident',
        created_at: new Date()
    },
    {
        id: 2,
        full_name: 'Maria Santos',
        email: 'moderator@barangchan.ph',
        password: 'moderator123',
        birthday: '1985-06-20',
        role: 'moderator',
        created_at: new Date()
    },
    {
        id: 3,
        full_name: 'Admin User',
        email: 'admin@barangchan.ph',
        password: 'admin123',
        birthday: '1980-03-10',
        role: 'administrator',
        created_at: new Date()
    }
];

const posts = [
    {
        id: 1,
        user_id: 1,
        user_name: 'Juan Dela Cruz',
        title: 'Broken street light',
        content: 'The street light in front of Barangay Hall has been broken for 3 days.',
        type: 'complaint',
        status: 'open',
        urgency: 'medium',
        created_at: new Date()
    },
    {
        id: 2,
        user_id: 1,
        user_name: 'Juan Dela Cruz',
        title: 'Clean-up drive this Saturday',
        content: 'Suggest we organize a community clean-up this weekend.',
        type: 'suggestion',
        status: 'open',
        urgency: 'low',
        created_at: new Date()
    }
];

const documentRequests = [
    {
        id: 1,
        user_id: 1,
        user_name: 'Juan Dela Cruz',
        document_type: 'Barangay Clearance',
        status: 'processing',
        progress_notes: 'Verifying residence',
        created_at: new Date()
    }
];

// ==================== MIDDLEWARE ====================
// Body parser for form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session management
app.use(session({
    secret: 'barangchan-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // set to true if using HTTPS
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==================== MIDDLEWARE TO MAKE USER AVAILABLE IN ALL VIEWS ====================
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// ==================== ROUTES ====================

// HOME PAGE - Redirect to login or dashboard based on session
app.get('/', (req, res) => {
    if (req.session.user) {
        // Redirect based on role
        switch(req.session.user.role) {
            case 'administrator':
                return res.redirect('/administrator/dashboard');
            case 'moderator':
                return res.redirect('/moderator/dashboard');
            default:
                return res.redirect('/client/dashboard');
        }
    }
    res.redirect('/login');
});

// ==================== LOGIN ROUTES ====================
// GET Login page
app.get('/login', (req, res) => {
    // If already logged in, redirect to appropriate dashboard
    if (req.session.user) {
        switch(req.session.user.role) {
            case 'administrator':
                return res.redirect('/administrator/dashboard');
            case 'moderator':
                return res.redirect('/moderator/dashboard');
            default:
                return res.redirect('/client/dashboard');
        }
    }
    
    // Pass any error message from session (for failed login attempts)
    const error = req.session.error;
    req.session.error = null; // Clear after displaying
    
    res.render('login', { 
        title: 'BarangChan - Login',
        error: error,
        year: new Date().getFullYear()
    });
});

// POST Login - handle authentication
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Simple validation
    if (!email || !password) {
        req.session.error = 'Please enter both email and password';
        return res.redirect('/login');
    }
    
    try {

        const userQuery = "SELECT email, password FROM User WHERE email = ?"
        const [userRow] = await conn.execute(userQuery, [email])

        if (userRow.length <= 0){
            res.status(400).send("Invalid login")
            return
        }

        const validPass = await bcrypt.compare(password, userRow[0]["password"] ) 

        if (!validPass) {
            res.status(400).send("Invalid login")
        }

        res.status(200).send("Yehay")
    } catch (err) {
        console.log(err)
        res.status(500).send("Server Error")
    }
  
    
});

// ==================== LOGOUT ROUTE ====================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// ==================== REGISTER ROUTE ====================
app.get('/register', (req, res) => {

    const err = req.session.error
    req.session.error = null
    res.render('register', { 
        title: 'BarangChan - Register',
        error: err,
        year: new Date().getFullYear()
    });
});

app.post('/register', async (req, res) => {
    const { first_name, last_name, middle_name, email, password, confirm_password, phone, city, barangay, street, zipcode } = req.body;

    try{
        full_name = first_name
        if (middle_name !== ""){
            full_name = full_name + " " + middle_name 
        } 
        full_name = full_name + " " + last_name
        
        
        
        
        //Simple validation
        if (!first_name || !last_name || !email || !password || !confirm_password) {
            req.session.error = 'Please fill in all required fields';
            return res.redirect('/register');
        }
        
        if (password !== confirm_password) {
            req.session.error = 'Passwords do not match';
            return res.redirect('/register');
        }

        
        const existQuery = "SELECT * FROM User WHERE email = ?"
        const [rows] = await conn.execute(existQuery, [email])

        if (rows.length > 0){
            req.session.error = 'Email already registered'
            return res.redirect('register')
        }

        


        
        hashedPass = await bcrypt.hash(password, 10)
        const insertUserQuery = "INSERT INTO User(first_name, last_name, middle_name, email, phone, password) VALUES (?, ?, ?, ?, ?, ?)"
        const [insertUserRow] = await conn.execute(insertUserQuery, [first_name, last_name, middle_name, email, phone, hashedPass])

        user_id = insertUserRow.insertId
        const insertAddressQuery = "INSERT INTO Address(user_id, city, barangay, street, zip) VALUES (?, ?, ?, ?, ?)"
        const [insertAddressRow] = await conn.execute(insertAddressQuery, [user_id, city, barangay, street, zipcode])

        res.status(200).send("User added successfully!")


    } catch (err) {
        console.log(err)
        res.status(500).send("Website down")
    }


    
    //res.redirect('/client/dashboard');
});

// ==================== CLIENT ROUTES (RESIDENTS) ====================
app.get('/client/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    // Get user's recent posts and requests
    const userPosts = posts.filter(p => p.user_id === req.session.user.id).slice(0, 5);
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id).slice(0, 5);
    
    res.render('client/dashboard', { 
        title: 'Resident Dashboard - BarangChan',
        user: req.session.user,
        posts: userPosts,
        requests: userRequests,
        recentPosts: posts.slice(0, 3) // Recent community posts
    });
});

app.get('/client/posts', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    res.render('client/posts', { 
        title: 'Community Posts - BarangChan',
        user: req.session.user,
        posts: posts,
        filter: req.query.filter || 'all'
    });
});

app.post('/client/posts/create', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const { title, content, type, urgency } = req.body;
    
    const newPost = {
        id: posts.length + 1,
        user_id: req.session.user.id,
        user_name: req.session.user.full_name,
        title: title,
        content: content,
        type: type || 'update',
        status: 'open',
        urgency: urgency || 'low',
        created_at: new Date()
    };
    
    posts.unshift(newPost); // Add to beginning of array
    console.log(`📝 New post created by ${req.session.user.full_name}`);
    
    res.redirect('/client/posts');
});

app.get('/client/requests', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id);
    
    res.render('client/requests', { 
        title: 'My Document Requests - BarangChan',
        user: req.session.user,
        requests: userRequests
    });
});

app.post('/client/requests/create', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const { document_type } = req.body;
    
    const newRequest = {
        id: documentRequests.length + 1,
        user_id: req.session.user.id,
        user_name: req.session.user.full_name,
        document_type: document_type,
        status: 'pending',
        progress_notes: 'Request received, waiting for processing',
        created_at: new Date()
    };
    
    documentRequests.push(newRequest);
    console.log(`📋 New document request by ${req.session.user.full_name}`);
    
    res.redirect('/client/requests');
});

// ==================== MODERATOR ROUTES ====================
app.get('/moderator/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied. Moderator area only.');
    }
    
    // Get statistics
    const stats = {
        totalPosts: posts.length,
        pendingPosts: posts.filter(p => p.status === 'pending').length,
        openPosts: posts.filter(p => p.status === 'open').length,
        closedPosts: posts.filter(p => p.status === 'closed').length,
        totalRequests: documentRequests.length,
        pendingRequests: documentRequests.filter(r => r.status === 'pending').length
    };
    
    res.render('moderator/dashboard', { 
        title: 'Moderator Dashboard - BarangChan',
        user: req.session.user,
        stats: stats,
        recentPosts: posts.slice(0, 10),
        recentRequests: documentRequests.slice(0, 10)
    });
});

app.get('/moderator/posts', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    res.render('moderator/posts', { 
        title: 'Manage Posts - BarangChan',
        user: req.session.user,
        posts: posts
    });
});

app.post('/moderator/posts/update/:id', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const postId = parseInt(req.params.id);
    const { status, urgency } = req.body;
    
    const post = posts.find(p => p.id === postId);
    if (post) {
        if (status) post.status = status;
        if (urgency) post.urgency = urgency;
        console.log(`✏️ Post ${postId} updated by moderator`);
    }
    
    res.redirect('/moderator/posts');
});

app.get('/moderator/requests', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    res.render('moderator/requests', { 
        title: 'Document Requests - BarangChan',
        user: req.session.user,
        requests: documentRequests
    });
});

app.post('/moderator/requests/update/:id', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const requestId = parseInt(req.params.id);
    const { status, progress_notes } = req.body;
    
    const request = documentRequests.find(r => r.id === requestId);
    if (request) {
        if (status) request.status = status;
        if (progress_notes) request.progress_notes = progress_notes;
        console.log(`📋 Request ${requestId} updated by moderator`);
    }
    
    res.redirect('/moderator/requests');
});

// ==================== ADMINISTRATOR ROUTES ====================
app.get('/administrator/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied. Administrator only.');
    }
    
    // Get system statistics
    const stats = {
        totalUsers: users.length,
        residents: users.filter(u => u.role === 'resident').length,
        moderators: users.filter(u => u.role === 'moderator').length,
        admins: users.filter(u => u.role === 'administrator').length,
        totalPosts: posts.length,
        totalRequests: documentRequests.length
    };
    
    res.render('administrator/dashboard', { 
        title: 'Admin Dashboard - BarangChan',
        user: req.session.user,
        stats: stats,
        recentUsers: users.slice(0, 5)
    });
});

app.get('/administrator/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    res.render('administrator/users', { 
        title: 'Manage Users - BarangChan',
        user: req.session.user,
        users: users
    });
});

app.post('/administrator/users/update/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (user && role) {
        user.role = role;
        console.log(`👤 User ${userId} role updated to ${role}`);
    }
    
    res.redirect('/administrator/users');
});

app.get('/administrator/settings', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    res.render('administrator/settings', { 
        title: 'System Settings - BarangChan',
        user: req.session.user
    });
});

// ==================== API ROUTES (for AJAX integration) ====================
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        version: '1.0.0',
        database: 'in-memory (no database required)',
        session: req.session.user ? 'authenticated' : 'guest',
        stats: {
            users: users.length,
            posts: posts.length,
            requests: documentRequests.length
        }
    });
});

app.get('/api/posts', (req, res) => {
    res.json(posts);
});

app.get('/api/users', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'administrator') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    // Don't send passwords
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json(safeUsers);
});

// ==================== ERROR HANDLING ====================
// 404 page
app.use((req, res) => {
    res.status(404).render('404', { 
        title: 'Page Not Found - BarangChan',
        user: req.session.user || null
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║                                                          ║
    ║     ██████╗  █████╗ ██████╗  █████╗ ███╗   ██╗ ██████╗  ║
    ║     ██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔════╝  ║
    ║     ██████╔╝███████║██████╔╝███████║██╔██╗ ██║██║  ███╗ ║
    ║     ██╔══██╗██╔══██║██╔══██╗██╔══██║██║╚██╗██║██║   ██║ ║
    ║     ██████╔╝██║  ██║██║  ██║██║  ██║██║ ╚████║╚██████╔╝ ║
    ║     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ║
    ║                                                          ║
    ║     🏝️  BarangChan Server is Running! (No Database)     ║
    ╠══════════════════════════════════════════════════════════╣
    ║     🌐 URL: http://localhost:${PORT}                      ║
    ║     📁 Mode: Development (In-Memory Storage)             ║
    ║     💾 Data: Resets when server restarts                 ║
    ║     👥 Roles: Resident, Moderator, Administrator         ║
    ╠══════════════════════════════════════════════════════════╣
    ║     📝 DEMO LOGIN CREDENTIALS:                           ║
    ║     • Resident:  resident@barangchan.ph / resident123    ║
    ║     • Moderator: moderator@barangchan.ph / moderator123  ║
    ║     • Admin:     admin@barangchan.ph / admin123          ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});