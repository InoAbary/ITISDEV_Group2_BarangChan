// govformController.js - Handle government forms and downloads
const conn = require('../config/db');
const path = require('path');
const fs = require('fs');

const govformController = {
    // Get all forms for the government forms page
    getAllForms: async (req, res) => {
        try {
            // Get all forms from database
            const query = `
                SELECT * FROM GovernmentForm 
                ORDER BY 
                    is_featured DESC,
                    category,
                    title ASC
            `;
            
            const [forms] = await conn.execute(query);
            
            // Get featured forms
            const featuredForms = forms.filter(f => f.is_featured);
            
            // Group forms by category
            const formsByCategory = {
                barangay: forms.filter(f => f.category === 'barangay'),
                national: forms.filter(f => f.category === 'national'),
                psa: forms.filter(f => f.category === 'psa'),
                bpls: forms.filter(f => f.category === 'bpls'),
                social: forms.filter(f => f.category === 'social'),
                education: forms.filter(f => f.category === 'education'),
                health: forms.filter(f => f.category === 'health'),
                others: forms.filter(f => f.category === 'others')
            };

            // Get counts per category
            const categoryCounts = {
                barangay: formsByCategory.barangay.length,
                national: formsByCategory.national.length,
                psa: formsByCategory.psa.length,
                bpls: formsByCategory.bpls.length,
                social: formsByCategory.social.length,
                education: formsByCategory.education.length,
                health: formsByCategory.health.length,
                others: formsByCategory.others.length,
                total: forms.length
            };

            res.render('govforms', {
                title: 'Government Forms - BarangChan',
                user: req.session.user || null,
                forms: forms,
                featuredForms: featuredForms,
                formsByCategory: formsByCategory,
                categoryCounts: categoryCounts,
                success: req.session.success,
                error: req.session.error
            });

            // Clear session messages
            delete req.session.success;
            delete req.session.error;

        } catch (error) {
            console.error('Error fetching forms:', error);
            
            // If database fails, render with empty data
            res.render('govforms', {
                title: 'Government Forms - BarangChan',
                user: req.session.user || null,
                forms: [],
                featuredForms: [],
                formsByCategory: {},
                categoryCounts: {
                    total: 0,
                    barangay: 0,
                    national: 0,
                    psa: 0,
                    bpls: 0,
                    social: 0,
                    education: 0,
                    health: 0,
                    others: 0
                },
                error: 'Error loading forms'
            });
        }
    },

    // Download a form by ID
    downloadForm: async (req, res) => {
        try {
            const formId = req.params.id;
            const userId = req.session.user ? req.session.user.id : null;
            
            // Get form details from database
            const query = "SELECT * FROM GovernmentForm WHERE form_id = ?";
            const [forms] = await conn.execute(query, [formId]);
            
            if (forms.length === 0) {
                return res.status(404).render('404', { 
                    title: 'Form Not Found',
                    user: req.session.user || null
                });
            }

            const form = forms[0];
            
            // Construct file path
            const filePath = path.join(__dirname, '../public', form.file_path);
            
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                console.error('File not found:', filePath);
                req.session.error = 'Form file not found. Please contact administrator.';
                return res.redirect('/client/govforms');
            }

            // Increment download count
            const updateQuery = "UPDATE GovernmentForm SET download_count = download_count + 1 WHERE form_id = ?";
            await conn.execute(updateQuery, [formId]);

            // Log download if user is logged in
            if (userId) {
                const logQuery = `
                    INSERT INTO FormDownload (form_id, user_id, ip_address) 
                    VALUES (?, ?, ?)
                `;
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                await conn.execute(logQuery, [formId, userId, ip]);
            }

            // Set appropriate headers for download
            const fileName = `${form.form_code || 'form'}_${form.title.replace(/\s+/g, '_')}.${form.file_type.toLowerCase()}`;
            
            res.download(filePath, fileName, (err) => {
                if (err) {
                    console.error('Download error:', err);
                    // Don't send another response if headers are already sent
                    if (!res.headersSent) {
                        req.session.error = 'Error downloading file';
                        res.redirect('/client/govforms');
                    }
                }
            });

        } catch (error) {
            console.error('Error downloading form:', error);
            req.session.error = 'Error downloading form';
            res.redirect('/client/govforms');
        }
    },

    // Get form details (for AJAX or modal display)
    getFormDetails: async (req, res) => {
        try {
            const formId = req.params.id;
            
            const query = "SELECT * FROM GovernmentForm WHERE form_id = ?";
            const [forms] = await conn.execute(query, [formId]);
            
            if (forms.length === 0) {
                return res.status(404).json({ error: 'Form not found' });
            }

            res.json({ success: true, form: forms[0] });

        } catch (error) {
            console.error('Error fetching form details:', error);
            res.status(500).json({ error: 'Error fetching form details' });
        }
    },

    // Search forms (AJAX endpoint)
    searchForms: async (req, res) => {
        try {
            const searchTerm = req.query.q || '';
            const category = req.query.category || 'all';
            const format = req.query.format || 'all';
            
            let query = `
                SELECT * FROM GovernmentForm 
                WHERE (title LIKE ? OR description LIKE ? OR form_code LIKE ?)
            `;
            let params = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];
            
            if (category !== 'all') {
                query += " AND category = ?";
                params.push(category);
            }
            
            if (format !== 'all') {
                query += " AND file_type = ?";
                params.push(format.toUpperCase());
            }
            
            query += " ORDER BY is_featured DESC, title ASC";
            
            const [forms] = await conn.execute(query, params);
            
            res.json({ success: true, forms: forms });

        } catch (error) {
            console.error('Error searching forms:', error);
            res.status(500).json({ error: 'Error searching forms' });
        }
    },

    // Admin: Add new form
    addForm: async (req, res) => {
        if (!req.session.user || req.session.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            const {
                title,
                description,
                category,
                file_name,
                file_size,
                file_type,
                form_code,
                version,
                is_featured,
                last_updated
            } = req.body;

            // Handle file upload
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const filePath = `/uploads/forms/${req.file.filename}`;

            const query = `
                INSERT INTO GovernmentForm 
                (title, description, category, file_name, file_path, file_size, file_type, form_code, version, is_featured, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await conn.execute(query, [
                title,
                description,
                category,
                req.file.originalname,
                filePath,
                file_size || Math.round(req.file.size / 1024),
                file_type || path.extname(req.file.originalname).substring(1).toUpperCase(),
                form_code,
                version,
                is_featured === 'true',
                last_updated || new Date()
            ]);

            res.json({ success: true, message: 'Form added successfully' });

        } catch (error) {
            console.error('Error adding form:', error);
            res.status(500).json({ error: 'Error adding form' });
        }
    },

    // Get download statistics (for admin)
    getDownloadStats: async (req, res) => {
        if (!req.session.user || req.session.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            const query = `
                SELECT 
                    f.form_id,
                    f.title,
                    f.download_count,
                    COUNT(fd.download_id) as recent_downloads,
                    MAX(fd.downloaded_at) as last_download
                FROM GovernmentForm f
                LEFT JOIN FormDownload fd ON f.form_id = fd.form_id
                GROUP BY f.form_id
                ORDER BY f.download_count DESC
            `;
            
            const [stats] = await conn.execute(query);
            
            res.json({ success: true, stats: stats });

        } catch (error) {
            console.error('Error fetching download stats:', error);
            res.status(500).json({ error: 'Error fetching statistics' });
        }
    }
};

module.exports = govformController;