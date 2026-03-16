// app.js - BarangChan Main Application File (With Database Support)
require("dotenv").config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const conn = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== IN-MEMORY STORAGE (Fallback) ====================
const users = [
    {
        id: 1,
        full_name: 'Juan Dela Cruz',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        email: 'resident@barangchan.ph',
        password: 'resident123',
        birthday: '1990-01-15',
        role: 'resident',
        barangay: 'Barangay San Antonio',
        city: 'Quezon City',
        created_at: new Date()
    },
    {
        id: 2,
        full_name: 'Maria Santos',
        first_name: 'Maria',
        last_name: 'Santos',
        email: 'moderator@barangchan.ph',
        password: 'moderator123',
        birthday: '1985-06-20',
        role: 'moderator',
        barangay: 'Barangay Poblacion',
        city: 'Makati City',
        created_at: new Date()
    },
    {
        id: 3,
        full_name: 'Admin User',
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@barangchan.ph',
        password: 'admin123',
        birthday: '1980-03-10',
        role: 'administrator',
        barangay: 'Barangay 1',
        city: 'Manila',
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session management
app.use(session({
    secret: 'barangchan-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as templating engine - points to multiple folders
app.set('view engine', 'ejs');
app.set('views', [
    path.join(__dirname, 'views'),         // for login, register
    path.join(__dirname, 'client'),        // for client pages
    path.join(__dirname, 'Moderator'),     // for moderator pages
    path.join(__dirname, 'administrator'), // for admin pages
    path.join(__dirname, 'Partials')       // for partials
]);

// ==================== MIDDLEWARE TO MAKE USER AVAILABLE ====================
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.currentPath = req.path;
    next();
});

// ==================== ROUTES ====================

// HOME PAGE
app.get('/', (req, res) => {
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
    res.redirect('/login');
});

// ==================== LOGIN ROUTES ====================
app.get('/login', (req, res) => {
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
    
    const error = req.session.error;
    req.session.error = null;
    
    res.render('LOGIN', {
        title: 'BarangChan - Login',
        error: error,
        year: new Date().getFullYear()
    });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        req.session.error = 'Please enter both email and password';
        return res.redirect('/login');
    }
    
    try {
        let user = null;
        let userRole = 'resident';
        
        // Try database first
        try {
            const userQuery = "SELECT id, first_name, last_name, middle_name, email, password, role FROM User WHERE email = ?";
            const [userRow] = await conn.execute(userQuery, [email]);

            if (userRow.length > 0) {
                const validPass = await bcrypt.compare(password, userRow[0]["password"]);
                
                if (validPass) {
                    const addressQuery = "SELECT city, barangay, street, zip FROM Address WHERE user_id = ?";
                    const [addressRow] = await conn.execute(addressQuery, [userRow[0].id]);
                    
                    let fullName = userRow[0].first_name;
                    if (userRow[0].middle_name) {
                        fullName += ' ' + userRow[0].middle_name;
                    }
                    fullName += ' ' + userRow[0].last_name;
                    
                    user = {
                        id: userRow[0].id,
                        full_name: fullName,
                        first_name: userRow[0].first_name,
                        last_name: userRow[0].last_name,
                        email: userRow[0].email,
                        role: userRow[0].role || 'resident',
                        barangay: addressRow[0]?.barangay || 'Barangay San Antonio',
                        city: addressRow[0]?.city || 'Quezon City'
                    };
                    userRole = user.role;
                }
            }
        } catch (dbErr) {
            console.log('Database error, falling back to memory:', dbErr.message);
            const memoryUser = users.find(u => u.email === email && u.password === password);
            if (memoryUser) {
                user = {
                    id: memoryUser.id,
                    full_name: memoryUser.full_name,
                    first_name: memoryUser.first_name,
                    last_name: memoryUser.last_name,
                    email: memoryUser.email,
                    role: memoryUser.role,
                    barangay: memoryUser.barangay,
                    city: memoryUser.city
                };
                userRole = memoryUser.role;
            }
        }

        if (user) {
            req.session.user = user;
            req.session.success = `Welcome back, ${user.first_name}!`;
            
            console.log(`✅ User logged in: ${user.email} (${user.role})`);
            
            switch(userRole) {
                case 'administrator':
                    return res.redirect('/administrator/dashboard');
                case 'moderator':
                    return res.redirect('/moderator/dashboard');
                default:
                    return res.redirect('/client/dashboard');
            }
        } else {
            req.session.error = 'Invalid email or password. Try demo accounts:\n• resident@barangchan.ph / resident123\n• moderator@barangchan.ph / moderator123\n• admin@barangchan.ph / admin123';
            return res.redirect('/login');
        }
    } catch (err) {
        console.log(err);
        req.session.error = 'Server error. Please try again.';
        res.redirect('/login');
    }
});

// ==================== LOGOUT ====================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.redirect('/login');
    });
});

// ==================== REGISTER ====================
app.get('/register', (req, res) => {
    const err = req.session.error;
    req.session.error = null;
    res.render('REGISTER', {
        title: 'BarangChan - Register',
        error: err,
        year: new Date().getFullYear()
    });
});

app.post('/register', async (req, res) => {
    const { first_name, last_name, middle_name, email, password, confirm_password, phone, city, barangay, street, zipcode } = req.body;

    try {
        if (!first_name || !last_name || !email || !password || !confirm_password) {
            req.session.error = 'Please fill in all required fields';
            return res.redirect('/register');
        }
        
        if (password !== confirm_password) {
            req.session.error = 'Passwords do not match';
            return res.redirect('/register');
        }

        try {
            const existQuery = "SELECT * FROM User WHERE email = ?";
            const [rows] = await conn.execute(existQuery, [email]);

            if (rows.length > 0) {
                req.session.error = 'Email already registered';
                return res.redirect('/register');
            }

            const hashedPass = await bcrypt.hash(password, 10);
            const insertUserQuery = "INSERT INTO User(first_name, last_name, middle_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?, 'resident')";
            const [insertUserRow] = await conn.execute(insertUserQuery, [first_name, last_name, middle_name || null, email, phone, hashedPass]);

            const user_id = insertUserRow.insertId;
            const insertAddressQuery = "INSERT INTO Address(user_id, city, barangay, street, zip) VALUES (?, ?, ?, ?, ?)";
            await conn.execute(insertAddressQuery, [user_id, city, barangay, street, zipcode]);

            let fullName = first_name;
            if (middle_name) fullName += ' ' + middle_name;
            fullName += ' ' + last_name;

            req.session.user = {
                id: user_id,
                full_name: fullName,
                first_name: first_name,
                last_name: last_name,
                email: email,
                role: 'resident',
                barangay: barangay,
                city: city
            };
            
            req.session.success = `Welcome to BarangChan, ${first_name}!`;
            return res.redirect('/client/dashboard');

        } catch (dbErr) {
            console.log('Database error during registration:', dbErr.message);
            
            if (users.find(u => u.email === email)) {
                req.session.error = 'Email already registered';
                return res.redirect('/register');
            }

            const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}`.trim();
            const newUser = {
                id: users.length + 1,
                first_name: first_name,
                last_name: last_name,
                middle_name: middle_name || null,
                full_name: fullName,
                email: email,
                phone: phone,
                password: password,
                role: 'resident',
                barangay: barangay,
                city: city,
                street: street,
                zipcode: zipcode,
                created_at: new Date()
            };
            
            users.push(newUser);
            
            req.session.user = {
                id: newUser.id,
                full_name: newUser.full_name,
                first_name: first_name,
                last_name: last_name,
                email: newUser.email,
                role: 'resident',
                barangay: barangay,
                city: city
            };
            
            req.session.success = `Welcome to BarangChan, ${first_name}!`;
            return res.redirect('/client/dashboard');
        }
    } catch (err) {
        console.log(err);
        req.session.error = 'Registration failed. Please try again.';
        res.redirect('/register');
    }
});

// ==================== CLIENT ROUTES ====================
app.get('/client/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const userPosts = posts.filter(p => p.user_id === req.session.user.id).slice(0, 5);
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id).slice(0, 5);
    
    const success = req.session.success;
    req.session.success = null;
    
    const allPosts = [
        {
            id: 1,
            user_name: 'Maria Santos',
            user_role: 'Barangay Secretary',
            user_avatar: 'M',
            time_ago: '2 hours ago',
            type: 'announcement',
            urgency: 'medium',
            title: 'Barangay Clearance Processing Update',
            content: 'Good news! We now have a faster processing time for Barangay Clearances. Please expect your documents within 2-3 working days.',
            likes: 24,
            comments: 7,
            shares: 3,
            is_official: true
        },
        {
            id: 2,
            user_name: 'Juan Dela Cruz',
            user_role: 'Resident',
            user_avatar: 'J',
            time_ago: '5 hours ago',
            type: 'concern',
            urgency: 'high',
            title: 'Broken Street Light in Phase 2',
            content: 'The street light near the basketball court has been broken for 3 days.',
            likes: 15,
            comments: 4,
            shares: 2,
            is_official: false
        }
    ];
    
    res.render('dashboard', {  // Note: just 'dashboard' not 'client/dashboard'
        title: 'Resident Dashboard - BarangChan',
        user: req.session.user,
        posts: allPosts,
        userPosts: userPosts,
        requests: userRequests,
        success: success
    });
});

app.get('/client/posts', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    res.render('posts', {  // Note: just 'posts' not 'client/posts'
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
        title: title || 'New Post',
        content: content,
        type: type || 'update',
        status: 'open',
        urgency: urgency || 'low',
        created_at: new Date()
    };
    
    posts.unshift(newPost);
    req.session.success = 'Your post has been published!';
    res.redirect('/client/dashboard');
});

app.get('/client/requests', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id);
    
    res.render('requests', {  // Note: just 'requests' not 'client/requests'
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
    req.session.success = 'Your document request has been submitted!';
    res.redirect('/client/requests');
});

app.get('/client/complaints', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id);
    
    res.render('complaints', {  // Note: just 'requests' not 'client/requests'
        title: 'File a Complaint - BarangChan',
        user: req.session.user,
        requests: userRequests
    });
});

app.get('/client/govforms', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const userRequests = documentRequests.filter(r => r.user_id === req.session.user.id);
    
    res.render('govforms', {  // Note: just 'requests' not 'client/requests'
        title: 'Government Forms - BarangChan',
        user: req.session.user,
        requests: userRequests
    });
});
// ==================== MODERATOR ROUTES ====================
app.get('/moderator/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const stats = {
        totalPosts: posts.length,
        pendingPosts: posts.filter(p => p.status === 'pending').length,
        openPosts: posts.filter(p => p.status === 'open').length,
        closedPosts: posts.filter(p => p.status === 'closed').length,
        totalRequests: documentRequests.length,
        pendingRequests: documentRequests.filter(r => r.status === 'pending').length
    };
    
    res.render('Dashboard_mod', {
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
    
    const stats = {
        totalPosts: posts.length,
        pendingPosts: posts.filter(p => p.status === 'pending').length,
        openPosts: posts.filter(p => p.status === 'open').length,
        closedPosts: posts.filter(p => p.status === 'closed').length,
        totalRequests: documentRequests.length,
        pendingRequests: documentRequests.filter(r => r.status === 'pending').length
    };
    
    res.render('posts_mod', {  // Note: special name to avoid conflict
        title: 'Moderator Posts - BarangChan',
        user: req.session.user,
        stats: stats,
        recentPosts: posts.slice(0, 10),
        recentRequests: documentRequests.slice(0, 10)
    });
});

app.get('/moderator/requests', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const stats = {
        totalPosts: posts.length,
        pendingPosts: posts.filter(p => p.status === 'pending').length,
        openPosts: posts.filter(p => p.status === 'open').length,
        closedPosts: posts.filter(p => p.status === 'closed').length,
        totalRequests: documentRequests.length,
        pendingRequests: documentRequests.filter(r => r.status === 'pending').length
    };
    
    res.render('requests_mod', {  // Note: special name to avoid conflict
        title: 'Moderator Requests - BarangChan',
        user: req.session.user,
        stats: stats,
        recentPosts: posts.slice(0, 10),
        recentRequests: documentRequests.slice(0, 10)
    });
});

app.get('/moderator/status_updates', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const stats = {
        totalPosts: posts.length,
        pendingPosts: posts.filter(p => p.status === 'pending').length,
        openPosts: posts.filter(p => p.status === 'open').length,
        closedPosts: posts.filter(p => p.status === 'closed').length,
        totalRequests: documentRequests.length,
        pendingRequests: documentRequests.filter(r => r.status === 'pending').length
    };
    
    res.render('status_updates_mod', {  // Note: special name to avoid conflict
        title: 'Moderator Status Updates - BarangChan',
        user: req.session.user,
        stats: stats,
        recentPosts: posts.slice(0, 10),
        recentRequests: documentRequests.slice(0, 10)
    });
});

// ==================== ADMINISTRATOR ROUTES ====================
app.get('/administrator/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'administrator') {
        return res.status(403).send('Access denied.');
    }
    
    const stats = {
        totalUsers: users.length,
        residents: users.filter(u => u.role === 'resident').length,
        moderators: users.filter(u => u.role === 'moderator').length,
        admins: users.filter(u => u.role === 'administrator').length,
        totalPosts: posts.length,
        totalRequests: documentRequests.length
    };
    
    res.render('Dashboard_admin', {
        title: 'Admin Dashboard - BarangChan',
        user: req.session.user,
        stats: stats,
        recentUsers: users.slice(0, 5)
    });
});

// ==================== 404 ====================
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
    ║     🏝️  BarangChan Server is Running!                    ║
    ╠══════════════════════════════════════════════════════════╣
    ║     🌐 URL: http://localhost:${PORT}                      ║
    ║     📂 Views: Multiple folders (views, client, etc.)     ║
    ╠══════════════════════════════════════════════════════════╣
    ║     📝 DEMO LOGIN:                                       ║
    ║     • resident@barangchan.ph / resident123              ║
    ║     • moderator@barangchan.ph / moderator123            ║
    ║     • admin@barangchan.ph / admin123                    ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
