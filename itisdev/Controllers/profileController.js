// controllers/profileController.js
const conn = require('../config/db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

class ProfileController {
    constructor() {
        this.uploadDir = './public/uploads/profile';
        
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        
        this.storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, 'profile-' + uniqueSuffix + ext);
            }
        });
        
        this.fileFilter = (req, file, cb) => {
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type. Only JPG, PNG, and GIF are allowed.'), false);
            }
        };
        
        this.upload = multer({
            storage: this.storage,
            fileFilter: this.fileFilter,
            limits: { fileSize: 5 * 1024 * 1024 }
        });
    }

    async getProfile(req, res) {
        try {
            if (!req.session.user || !req.session.user.id) {
                req.session.error = 'Please login to view your profile';
                return res.redirect('/login');
            }
            
            const userId = req.session.user.id;
            
            // Fix: Remove created_at from Address query since it doesn't exist
            const [users] = await conn.execute(`
                SELECT 
                    u.user_id,
                    u.username,
                    u.first_name,
                    u.last_name,
                    u.middle_name,
                    u.email,
                    u.phone,
                    u.password,
                    u.role,
                    u.status,
                    u.photo,
                    u.last_login,
                    u.created_at,
                    a.city,
                    a.barangay,
                    a.street,
                    a.zip
                FROM User u
                LEFT JOIN Address a ON u.user_id = a.user_id
                WHERE u.user_id = ?
            `, [userId]);
            
            if (users.length === 0) {
                req.session.error = 'User not found';
                return res.redirect('/login');
            }
            
            const userData = users[0];
            
            const user = {
                id: userData.user_id,
                username: userData.username || userData.email,
                first_name: userData.first_name,
                last_name: userData.last_name,
                middle_name: userData.middle_name,
                full_name: `${userData.first_name} ${userData.middle_name ? userData.middle_name + ' ' : ''}${userData.last_name}`,
                email: userData.email,
                phone: userData.phone,
                role: userData.role,
                status: userData.status,
                photo: userData.photo,
                last_login: userData.last_login,
                created_at: userData.created_at,
                street_address: userData.street,
                barangay: userData.barangay,
                city: userData.city,
                zip: userData.zip
            };
            
            // Initialize stats
            let stats = {
                total_posts: 0,
                total_comments: 0,
                total_complaints: 0,
                total_requests: 0
            };
            
            try {
                const [statsResult] = await conn.execute(`
                    SELECT 
                        (SELECT COUNT(*) FROM StatusPost WHERE user_id = ?) as total_posts,
                        (SELECT COUNT(*) FROM PostComment WHERE user_id = ?) as total_comments,
                        (SELECT COUNT(*) FROM ComplaintForm WHERE user_id = ?) as total_complaints,
                        (SELECT COUNT(*) FROM RequestForm WHERE user_id = ?) as total_requests
                `, [userId, userId, userId, userId]);
                
                if (statsResult && statsResult.length > 0) {
                    stats = statsResult[0];
                }
            } catch (statsError) {
                console.error('Error fetching stats:', statsError);
            }
            
            // Initialize recent activity - using correct column names from your schema
            let recentActivity = [];
            
            try {
                // StatusPost uses: post_id, title, body, date_posted (not created_at)
                // PostComment uses: comment_id, content, created_at
                // ComplaintForm uses: complaint_id, allegations, complaint_date (not created_at)
                // RequestForm uses: request_id, document_request, request_date (not created_at)
                
                const [activityResult] = await conn.execute(`
                    (SELECT 'post' as type, post_id as id, title, body as content, date_posted as created_at, status
                     FROM StatusPost WHERE user_id = ? 
                     ORDER BY date_posted DESC LIMIT 3)
                    UNION ALL
                    (SELECT 'comment' as type, comment_id as id, '' as title, content, created_at, '' as status
                     FROM PostComment WHERE user_id = ? 
                     ORDER BY created_at DESC LIMIT 3)
                    UNION ALL
                    (SELECT 'complaint' as type, complaint_id as id, '' as title, allegations as content, complaint_date as created_at, status
                     FROM ComplaintForm WHERE user_id = ? 
                     ORDER BY complaint_date DESC LIMIT 3)
                    UNION ALL
                    (SELECT 'request' as type, request_id as id, '' as title, document_request as content, request_date as created_at, status
                     FROM RequestForm WHERE user_id = ? 
                     ORDER BY request_date DESC LIMIT 3)
                    ORDER BY created_at DESC LIMIT 10
                `, [userId, userId, userId, userId]);
                
                if (activityResult && activityResult.length > 0) {
                    recentActivity = activityResult;
                }
            } catch (activityError) {
                console.error('Error fetching activity:', activityError);
            }
            
            const success = req.session.success;
            const error = req.session.error;
            delete req.session.success;
            delete req.session.error;
            
            res.render('profile', {
                title: 'My Profile - BarangChan',
                user: user,
                stats: stats,
                recentActivity: recentActivity,
                success: success,
                error: error,
                currentPath: '/profile'
            });
            
        } catch (error) {
            console.error('Error in getProfile:', error);
            req.session.error = 'Failed to load profile. Please try again.';
            res.redirect('/login');
        }
    }
    
    async updateProfile(req, res) {
        try {
            if (!req.session.user || !req.session.user.id) {
                req.session.error = 'Not authenticated';
                return res.redirect('/login');
            }
            
            const userId = req.session.user.id;
            const {
                first_name,
                last_name,
                middle_name,
                email,
                phone,
                street_address,
                barangay,
                city,
                zip
            } = req.body;
            
            if (!first_name || !last_name || !email) {
                req.session.error = 'First name, last name, and email are required';
                return res.redirect('/profile');
            }
            
            // Check if email is already taken
            const [existingUser] = await conn.execute(
                'SELECT user_id FROM User WHERE email = ? AND user_id != ?',
                [email, userId]
            );
            
            if (existingUser.length > 0) {
                req.session.error = 'Email address is already in use by another account';
                return res.redirect('/profile');
            }
            
            // Get a connection from the pool for transaction
            const connection = await conn.getConnection();
            
            try {
                // Start transaction manually
                await connection.query('START TRANSACTION');
                
                // Update user table
                await connection.execute(`
                    UPDATE User 
                    SET first_name = ?, last_name = ?, middle_name = ?, email = ?, phone = ?
                    WHERE user_id = ?
                `, [first_name, last_name, middle_name || null, email, phone, userId]);
                
                // Check if address exists
                const [existingAddress] = await connection.execute(
                    'SELECT address_id FROM Address WHERE user_id = ?',
                    [userId]
                );
                
                if (existingAddress.length > 0) {
                    // Update existing address
                    await connection.execute(`
                        UPDATE Address 
                        SET street = ?, barangay = ?, city = ?, zip = ?
                        WHERE user_id = ?
                    `, [street_address, barangay, city, zip, userId]);
                } else {
                    // Insert new address
                    await connection.execute(`
                        INSERT INTO Address (user_id, street, barangay, city, zip)
                        VALUES (?, ?, ?, ?, ?)
                    `, [userId, street_address, barangay, city, zip]);
                }
                
                // Commit transaction
                await connection.query('COMMIT');
                
                // Update session data
                req.session.user.first_name = first_name;
                req.session.user.last_name = last_name;
                req.session.user.middle_name = middle_name;
                req.session.user.email = email;
                req.session.user.phone = phone;
                req.session.user.street_address = street_address;
                req.session.user.barangay = barangay;
                req.session.user.city = city;
                req.session.user.zip = zip;
                
                req.session.success = 'Profile updated successfully!';
                
            } catch (err) {
                // Rollback on error
                await connection.query('ROLLBACK');
                throw err;
            } finally {
                // Release connection back to pool
                connection.release();
            }
            
            res.redirect('/profile');
            
        } catch (error) {
            console.error('Error in updateProfile:', error);
            req.session.error = 'Failed to update profile. Please try again.';
            res.redirect('/profile');
        }
    }
    
    async changePassword(req, res) {
        try {
            console.log('Change password request received');
            console.log('Request body:', req.body);
            
            if (!req.session.user || !req.session.user.id) {
                console.log('No user in session');
                req.session.error = 'Not authenticated';
                return res.redirect('/login');
            }
            
            const userId = req.session.user.id;
            const { current_password, new_password, confirm_password } = req.body;
            
            console.log('User ID:', userId);
            console.log('Current password provided:', current_password ? 'Yes' : 'No');
            console.log('New password provided:', new_password ? 'Yes' : 'No');
            console.log('Confirm password provided:', confirm_password ? 'Yes' : 'No');
            
            // Validate inputs
            if (!current_password) {
                req.session.error = 'Current password is required';
                return res.redirect('/profile');
            }
            
            if (!new_password) {
                req.session.error = 'New password is required';
                return res.redirect('/profile');
            }
            
            if (!confirm_password) {
                req.session.error = 'Please confirm your new password';
                return res.redirect('/profile');
            }
            
            // Check if new passwords match
            if (new_password !== confirm_password) {
                req.session.error = 'New passwords do not match';
                return res.redirect('/profile');
            }
            
            // Check password strength
            const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
            if (!passwordRegex.test(new_password)) {
                req.session.error = 'Password must be at least 8 characters, include 1 uppercase letter and 1 special symbol';
                return res.redirect('/profile');
            }
            
            // Get user's current password from database
            const [users] = await conn.execute(
                'SELECT password FROM User WHERE user_id = ?',
                [userId]
            );
            
            console.log('User found:', users.length > 0 ? 'Yes' : 'No');
            
            if (users.length === 0) {
                req.session.error = 'User not found';
                return res.redirect('/profile');
            }
            
            // Verify current password
            const validPassword = await bcrypt.compare(current_password, users[0].password);
            console.log('Current password valid:', validPassword);
            
            if (!validPassword) {
                req.session.error = 'Current password is incorrect';
                return res.redirect('/profile');
            }
            
            // Hash new password
            const hashedPassword = await bcrypt.hash(new_password, 10);
            
            // Update password in database
            const [updateResult] = await conn.execute(
                'UPDATE User SET password = ? WHERE user_id = ?',
                [hashedPassword, userId]
            );
            
            console.log('Update result:', updateResult);
            
            // Also update session password if you store it (though you shouldn't store plain password)
            // req.session.user.password = new_password; // Don't do this! Keep hashed in session if needed
            
            req.session.success = 'Password changed successfully!';
            console.log('Password changed successfully for user:', userId);
            
            res.redirect('/profile');
            
        } catch (error) {
            console.error('Error in changePassword:', error);
            console.error('Error stack:', error.stack);
            req.session.error = 'Failed to change password. Please try again.';
            res.redirect('/profile');
        }
    }
    
    async uploadPhoto(req, res) {
        try {
            if (!req.session.user || !req.session.user.id) {
                req.session.error = 'Not authenticated';
                return res.redirect('/login');
            }
            
            this.upload.single('photo')(req, res, async (err) => {
                if (err) {
                    console.error('Upload error:', err);
                    req.session.error = err.message || 'Failed to upload photo';
                    return res.redirect('/profile');
                }
                
                if (!req.file) {
                    req.session.error = 'No file selected';
                    return res.redirect('/profile');
                }
                
                const userId = req.session.user.id;
                const photoFilename = req.file.filename;
                
                const [users] = await conn.execute(
                    'SELECT photo FROM User WHERE user_id = ?',
                    [userId]
                );
                
                if (users[0] && users[0].photo) {
                    const oldPhotoPath = path.join(this.uploadDir, users[0].photo);
                    if (fs.existsSync(oldPhotoPath)) {
                        fs.unlinkSync(oldPhotoPath);
                    }
                }
                
                await conn.execute(
                    'UPDATE User SET photo = ? WHERE user_id = ?',
                    [photoFilename, userId]
                );
                
                req.session.user.photo = photoFilename;
                req.session.success = 'Profile photo updated successfully!';
                res.redirect('/profile');
            });
            
        } catch (error) {
            console.error('Error in uploadPhoto:', error);
            req.session.error = 'Failed to upload photo. Please try again.';
            res.redirect('/profile');
        }
    }
    
    async deletePhoto(req, res) {
        try {
            if (!req.session.user || !req.session.user.id) {
                req.session.error = 'Not authenticated';
                return res.redirect('/login');
            }
            
            const userId = req.session.user.id;
            
            const [users] = await conn.execute(
                'SELECT photo FROM User WHERE user_id = ?',
                [userId]
            );
            
            if (users[0] && users[0].photo) {
                const photoPath = path.join(this.uploadDir, users[0].photo);
                if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath);
                }
                
                await conn.execute(
                    'UPDATE User SET photo = NULL WHERE user_id = ?',
                    [userId]
                );
                
                req.session.user.photo = null;
                req.session.success = 'Profile photo removed successfully!';
            }
            
            res.redirect('/profile');
            
        } catch (error) {
            console.error('Error in deletePhoto:', error);
            req.session.error = 'Failed to remove photo. Please try again.';
            res.redirect('/profile');
        }
    }
    
    async deleteAccount(req, res) {
        try {
            if (!req.session.user || !req.session.user.id) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }
            
            const userId = req.session.user.id;
            const { password } = req.body;
            
            const [users] = await conn.execute(
                'SELECT password FROM User WHERE user_id = ?',
                [userId]
            );
            
            if (users.length === 0) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            const validPassword = await bcrypt.compare(password, users[0].password);
            if (!validPassword) {
                return res.status(401).json({ success: false, error: 'Incorrect password' });
            }
            
            // Get a connection from the pool for transaction
            const connection = await conn.getConnection();
            
            try {
                await connection.query('START TRANSACTION');
                
                // Get user photo
                const [userData] = await connection.execute(
                    'SELECT photo FROM User WHERE user_id = ?',
                    [userId]
                );
                
                if (userData[0] && userData[0].photo) {
                    const photoPath = path.join(this.uploadDir, userData[0].photo);
                    if (fs.existsSync(photoPath)) {
                        fs.unlinkSync(photoPath);
                    }
                }
                
                // Archive user data
                await connection.execute(`
                    INSERT INTO user_audit (user_id, username, first_name, last_name, email, phone, role, date_deleted)
                    SELECT user_id, username, first_name, last_name, email, phone, role, NOW()
                    FROM User WHERE user_id = ?
                `, [userId]);
                
                // Delete user (cascading will handle related records)
                await connection.execute('DELETE FROM User WHERE user_id = ?', [userId]);
                
                await connection.query('COMMIT');
                
                req.session.destroy();
                
                res.json({
                    success: true,
                    message: 'Account deleted successfully'
                });
                
            } catch (err) {
                await connection.query('ROLLBACK');
                throw err;
            } finally {
                connection.release();
            }
            
        } catch (error) {
            console.error('Error in deleteAccount:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete account. Please try again.'
            });
        }
    }
}

// Export as an instance
const profileController = new ProfileController();
module.exports = profileController;