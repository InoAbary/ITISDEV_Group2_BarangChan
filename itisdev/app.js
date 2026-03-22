// app.js - BarangChan Main Application File (With Database Support)
require("dotenv").config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const multer = require('multer'); 
const fs = require('fs'); 

const conn = require('./config/db');
const postController = require('./Controllers/postController')
const forumController = require('./Controllers/forumController')
const complaintController = require('./Controllers/complaintController')
const requestController = require('./Controllers/requestController')
const govformController = require('./Controllers/govFormController');
const contactsController = require('./Controllers/contactsController')

const moderatorController = require('./Controllers/moderatorController');

const AdminController = require('./Controllers/adminController')

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== FILE UPLOAD CONFIGURATION ====================
// Ensure upload directories exist

// async function generateHashes() {
//     const residentHash = await bcrypt.hash('resident123', 10);
//     const moderatorHash = await bcrypt.hash('moderator123', 10);
//     const adminHash = await bcrypt.hash('admin123', 10);
    
//     console.log('resident@barangchan.ph hash:', residentHash);
//     console.log('moderator@barangchan.ph hash:', moderatorHash);
//     console.log('admin@barangchan.ph hash:', adminHash);
// }

// generateHashes();
const uploadDirs = [
    './public/uploads/complaints',
    './public/uploads/requests',
    './public/uploads/profile'
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Determine destination based on route
        if (req.path.includes('complaints')) {
            cb(null, './public/uploads/complaints/');
        } else if (req.path.includes('requests')) {
            cb(null, './public/uploads/requests/');
        } else {
            cb(null, './public/uploads/');
        }
    },
    filename: function (req, file, cb) {
        // Create unique filename: timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPG, PNG, GIF, MP4, MOV, and PDF are allowed.'), false);
    }
};

// Create multer upload instance
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit per file
    }
});

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
            const userQuery = "SELECT user_id, first_name, last_name, middle_name, email, password, role FROM User WHERE email = ?";
            const [userRow] = await conn.execute(userQuery, [email]);

            if (userRow.length > 0) {
                const validPass = await bcrypt.compare(password, userRow[0]["password"]);
                
                if (validPass) {
                    
                    const addressQuery = "SELECT city, barangay, street, zip FROM Address WHERE user_id = ?";
                    const [addressRow] = await conn.execute(addressQuery, [userRow[0].user_id]);
                    
                    let fullName = userRow[0].first_name;
                    if (userRow[0].middle_name) {
                        fullName += ' ' + userRow[0].middle_name;
                    }
                    fullName += ' ' + userRow[0].last_name;
                    
                    user = {
                        id: userRow[0].user_id,
                        full_name: fullName,
                        first_name: userRow[0].first_name,
                        last_name: userRow[0].last_name,
                        email: userRow[0].email,
                        role: userRow[0].role || 'resident',
                        barangay: addressRow[0]?.barangay || 'Barangay San Antonio',
                        city: addressRow[0]?.city || 'Quezon City',
                        username: userRow[0].email, // Add this
                        photo: null // Add this
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
                    city: memoryUser.city,
                    username: memoryUser.email, // Add this
                    photo: memoryUser.photo || null // Add this
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

            // Make sure the user object structure matches what dashboard.ejs expects
            req.session.user = {
                id: user_id,
                full_name: fullName,
                first_name: first_name,
                last_name: last_name,
                email: email,
                role: 'resident',
                barangay: barangay,
                city: city,
                // Add these fields that might be used in the navigation
                username: email, // or whatever you want as username
                photo: null
            };
            
            req.session.success = `Welcome to BarangChan, ${first_name}!`;
            return res.redirect('/client/dashboard');

        } catch (dbErr) {
            console.log('Database error during registration:', dbErr.message);
            
            // Fallback to memory storage
            const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}`.trim();
            const newUser = {
                id: users.length + 1,
                first_name: first_name,
                last_name: last_name,
                middle_name: middle_name || null,
                full_name: fullName,
                email: email,
                phone: phone,
                password: password, // In production, hash this!
                role: 'resident',
                barangay: barangay,
                city: city,
                street: street,
                zipcode: zipcode,
                username: email,
                photo: null,
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
                city: city,
                username: email,
                photo: null
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


// ==================== AI CHATBOT ROUTES ====================
const chatbotController = require('./Ai/chatbotController');

// Chatbot API endpoints
app.post('/api/chatbot/chat', chatbotController.chat.bind(chatbotController));
app.get('/api/chatbot/quick-actions', chatbotController.getQuickActions.bind(chatbotController));
app.post('/api/chatbot/moderator/connect', chatbotController.createModeratorChat.bind(chatbotController));
app.post('/api/chatbot/moderator/message', chatbotController.sendModeratorMessage.bind(chatbotController));
app.get('/api/chatbot/moderator/history/:chatId', chatbotController.getModeratorChatHistory.bind(chatbotController));
app.get('/api/chatbot/moderator/status', chatbotController.getModeratorStatus.bind(chatbotController));
app.post('/api/chatbot/moderator/leave-message', chatbotController.leaveMessage.bind(chatbotController));
// ==================== CLIENT ROUTES ====================
app.get('/client/dashboard', postController.getAllPosts);

app.post('/client/dashboard/create', postController.createPost);

app.post('/client/dashboard/:id/like', postController.likePost);

app.post('/client/dashboard/:id/comment', postController.addComment);

app.get('/client/dashboard/:id', postController.getPost);

app.get('/client/forum', forumController.getAllTopics);

app.post('/client/forum/create', forumController.createTopic);

app.get('/client/forum/topic/:id', forumController.getTopic);

app.post('/client/forum/topic/:id/reply', forumController.addReply);

app.get('/client/requests', requestController.getUserRequests);

// Create new request (with file upload support for ID pictures)
app.post('/client/requests/create', 
    upload.fields([
        { name: 'validId', maxCount: 1 },
        { name: 'proofResidency', maxCount: 1 },
        { name: 'cedula', maxCount: 1 },
        { name: 'barangayCert', maxCount: 1 },
        { name: 'dtiRegistration', maxCount: 1 },
        { name: 'barangayClearance', maxCount: 1 },
        { name: 'businessAddress', maxCount: 1 },
        { name: 'utilityBill', maxCount: 1 },
        { name: 'birthCertificate', maxCount: 1 },
        { name: 'idPicture', maxCount: 1 },
        { name: 'assistanceDocument', maxCount: 1 }
    ]),
    requestController.createRequest
);

// Get single request details
app.get('/client/requests/:id', requestController.getRequestDetails);

// Cancel request
app.post('/client/requests/:id/cancel', requestController.cancelRequest);

app.get('/client/complaints', complaintController.getUserComplaints);

// Create new complaint (with file upload support)
app.post('/client/complaints/create', 
    upload.array('evidence', 5), // Allow up to 5 files
    complaintController.createComplaint
);

// Get single complaint details
app.get('/client/complaints/:id', complaintController.getComplaintDetails);

// Add comment to complaint
app.post('/client/complaints/:id/comment', complaintController.addComment);


app.post('/client/complaints/:id/cancel', complaintController.cancelComplaint);

app.get('/client/govforms', govformController.getAllForms);

// Download form by ID
app.get('/client/govforms/download/:id', govformController.downloadForm);

// Get form details (AJAX)
app.get('/client/govforms/api/form/:id', govformController.getFormDetails);

// Search forms (AJAX)
app.get('/client/govforms/api/search', govformController.searchForms);




// Delete reply (moderator only)
app.post('/client/forum/reply/:replyId/delete', forumController.deleteReply);

// Main contacts page
app.get('/contacts', contactsController.getAllContacts);

// API Routes
app.get('/api/contacts/category/:categoryId', contactsController.getContactsByCategory);
app.get('/api/contacts/emergency', contactsController.getEmergencyContacts);
app.get('/api/contacts/:contactId', contactsController.getContactDetails);
app.post('/api/contacts/:contactId/favorite', contactsController.toggleFavorite);
app.get('/api/contacts/search', contactsController.searchContacts);
app.get('/api/contacts/officials/:barangay', contactsController.getBarangayOfficials);


// ==================== MODERATOR ROUTES ====================

// Dashboard
app.get('/moderator/dashboard', moderatorController.getDashboard);

// Posts Management
app.get('/moderator/posts', moderatorController.getPosts);
app.post('/moderator/posts/create', moderatorController.createAnnouncement);
app.post('/moderator/posts/:id/approve', moderatorController.approvePost);
app.post('/moderator/posts/:id/reject', moderatorController.rejectPost);

// Document Requests Management
app.get('/moderator/requests', moderatorController.getRequests);
app.post('/moderator/requests/:id/update', moderatorController.updateRequestStatus);

// ==================== COMPLAINTS MANAGEMENT (NEW) ====================
app.get('/moderator/complaints', moderatorController.getComplaints);
app.post('/moderator/complaints/:id/status', moderatorController.updateComplaintStatus);
app.post('/moderator/complaints/:id/note', moderatorController.addComplaintNote);

// Help Desk / Support
app.get('/moderator/help-desk', moderatorController.getHelpDesk);

// Reports & Analytics
app.get('/moderator/reports/generate', moderatorController.generateReport);
app.get('/moderator/urgent-issues', moderatorController.getUrgentIssues);




// ==================== ADMINISTRATOR ROUTES ====================
app.get('/administrator/dashboard', AdminController.getDashboard);

// Moderator Management
app.get('/administrator/moderators', AdminController.getModerators);
app.post('/administrator/moderators/:id/update', AdminController.updateModeratorRole);

// Reports & Analytics
app.get('/administrator/reports/generate', AdminController.generateReport);
app.get('/administrator/analytics/realtime', AdminController.getRealTimeAnalytics);

// Keep the existing admin routes for backward compatibility
app.get('/administrator/users', (req, res) => {
    res.render('users_admin', {
        title: 'Manage Users- BarangChan',
        user: req.session.user,
        success: req.session.success,
        error: req.session.error
    });
});



// Add this API endpoint for complaint details (in app.js)
app.get('/api/complaints/:id/details', async (req, res) => {
    try {
        const complaintId = req.params.id;
        
        // Fetch complaint details
        const [complaint] = await conn.execute(`
            SELECT 
                cf.complaint_id as id,
                cf.user_id,
                cf.name as complainant_name,
                cf.email,
                cf.phone,
                cf.address,
                cf.allegations,
                cf.narration,
                cf.status,
                cf.complaint_date,
                TIMESTAMPDIFF(DAY, cf.complaint_date, NOW()) as days_pending
            FROM ComplaintForm cf
            WHERE cf.complaint_id = ?
        `, [complaintId]);
        
        if (complaint.length === 0) {
            return res.json({ success: false, message: 'Complaint not found' });
        }
        
        // Fetch files
        const [files] = await conn.execute(`
            SELECT file_id, original_name, stored_name, mime_type, file_path, uploaded_at
            FROM ComplaintFiles WHERE complaint_id = ?
        `, [complaintId]);
        
        // Fetch updates/comments with user information
        const [updates] = await conn.execute(`
            SELECT 
                pc.comment_id, 
                pc.content, 
                pc.created_at,
                CONCAT(u.first_name, ' ', u.last_name) as user_name,
                u.role as user_role
            FROM PostComment pc
            LEFT JOIN User u ON pc.user_id = u.user_id
            WHERE pc.post_id = ?
            ORDER BY pc.created_at ASC
        `, [complaintId]);
        
        res.json({
            success: true,
            complaint: {
                ...complaint[0],
                files: files,
                updates: updates
            }
        });
        
    } catch (error) {
        console.error('Error fetching complaint details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== PROFILE ================

// app.js - Profile routes (Session-based, no database)

// GET profile page
app.get('/profile', (req, res) => {
    // Check if user is logged in via session
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const user = req.session.user;
    
    // Determine which dashboard to redirect to based on role
    let dashboardPath = '/client/dashboard';
    if (user.role === 'admin') {
        dashboardPath = '/administrator/dashboard';
    } else if (user.role === 'moderator') {
        dashboardPath = '/moderator/dashboard';
    }
    
    // Get success/error messages from session and clear them
    const success = req.session.success;
    const error = req.session.error;
    delete req.session.success;
    delete req.session.error;
    
    res.render('profile', { 
        user: user,
        dashboardPath: dashboardPath,
        currentPath: '/profile',
        success: success,
        error: error
    });
});

// POST update profile
app.post('/profile/update', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const { 
        first_name, 
        last_name, 
        middle_name, 
        email, 
        phone, 
        street_address, 
        barangay, 
        city,
        current_password,
        new_password,
        confirm_password
    } = req.body;
    
    // Get current user from session
    const user = req.session.user;
    
    // Update session user data
    user.first_name = first_name || user.first_name;
    user.last_name = last_name || user.last_name;
    user.middle_name = middle_name || user.middle_name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.street_address = street_address || user.street_address;
    user.barangay = barangay || user.barangay;
    user.city = city || user.city;
    
    // Handle password change if requested
    if (new_password) {
        // Check if current password matches (simple check - in production you'd use bcrypt)
        if (current_password !== user.password) {
            req.session.error = 'Current password is incorrect';
            return res.redirect('/profile');
        }
        
        // Check if new passwords match
        if (new_password !== confirm_password) {
            req.session.error = 'New passwords do not match';
            return res.redirect('/profile');
        }
        
        // Update password in session
        user.password = new_password;
    }
    
    // Save updated user back to session
    req.session.user = user;
    req.session.success = 'Profile updated successfully';
    
    res.redirect('/profile');
});

// POST upload profile photo (simulated)
app.post('/profile/photo', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    // In a real implementation, you'd handle file upload here
    // For now, we'll just set a mock photo path
    
    const user = req.session.user;
    user.photo = '/images/default-avatar.png'; // Mock photo path
    req.session.user = user;
    req.session.success = 'Profile photo updated';
    
    res.redirect('/profile');
});

// POST change password only (separate endpoint)
app.post('/profile/password', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const { current_password, new_password, confirm_password } = req.body;
    const user = req.session.user;
    
    // Check if current password matches
    if (current_password !== user.password) {
        req.session.error = 'Current password is incorrect';
        return res.redirect('/profile');
    }
    
    // Check if new passwords match
    if (new_password !== confirm_password) {
        req.session.error = 'New passwords do not match';
        return res.redirect('/profile');
    }
    
    // Update password in session
    user.password = new_password;
    req.session.user = user;
    req.session.success = 'Password changed successfully';
    
    res.redirect('/profile');
});

app.get('/contacts', (req, res) => {
    // Check if user is logged in via session
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const user = req.session.user;
    
    // Determine which dashboard to redirect to based on role
    let contactsPath = '/views/contacts';
    
    
    // Get success/error messages from session and clear them
    const success = req.session.success;
    const error = req.session.error;
    delete req.session.success;
    delete req.session.error;
    
    res.render('contacts', { 
        user: user,
        contactsPath: contactsPath,
        currentPath: '/contacts',
        success: success,
        error: error
    });
});

// Test Gemini connection
app.get('/api/test-gemini', async (req, res) => {
    try {
        const aiService = require('./Ai/aiService');
        const response = await aiService.generateResponse("Say 'Hello! Gemini is working!'", { pageContext: 'test' }, []);
        res.json({ 
            success: true, 
            message: 'Gemini test completed',
            response: response,
            configured: aiService.isConfigured
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message,
            configured: false
        });
    }
});

// Add this after other requires
const serverTimeout = process.env.SERVER_TIMEOUT || 3600000; // 1 hour
app.use((req, res, next) => {
    req.setTimeout(serverTimeout);
    res.setTimeout(serverTimeout);
    next();
});

// ==================== 404 ====================
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

