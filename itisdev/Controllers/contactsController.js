// controllers/contactsController.js
const db = require('../config/db');
const moment = require('moment');

class contactsController {
    
    // Get all contacts with categories
    static async getAllContacts(req, res) {
        try {
            const userId = req.session.user?.user_id;
            const language = req.query.lang || req.session.language || 'en';
            
            // Get barangay info (Baliuag specific)
            const [barangayInfo] = await db.query(`
                SELECT * FROM BarangayInfo 
                WHERE barangay_name = ? OR barangay_name = 'San Antonio'
                LIMIT 1
            `, [req.session.user?.barangay || 'San Antonio']);
            
            // Get categories with their contacts
            const [categories] = await db.query(`
                SELECT c.*, 
                    COUNT(co.contact_id) as contact_count
                FROM ContactCategory c
                LEFT JOIN BarangayContact co ON c.category_id = co.category_id AND co.is_active = TRUE
                WHERE c.is_active = TRUE
                GROUP BY c.category_id
                ORDER BY c.display_order
            `);
            
            // Get contacts for each category
            for (let category of categories) {
                const [contacts] = await db.query(`
                    SELECT * FROM BarangayContact 
                    WHERE category_id = ? AND is_active = TRUE
                    ORDER BY is_emergency DESC, display_order
                `, [category.category_id]);
                
                // Check if user has favorited these contacts
                if (userId) {
                    for (let contact of contacts) {
                        const [favorite] = await db.query(
                            'SELECT * FROM UserFavoriteContact WHERE user_id = ? AND contact_id = ?',
                            [userId, contact.contact_id]
                        );
                        contact.is_favorited = favorite.length > 0;
                    }
                }
                
                category.contacts = contacts;
            }
            
            // Get emergency hotlines (national and local)
            const [emergencyHotlines] = await db.query(`
                SELECT * FROM EmergencyHotline 
                WHERE is_active = TRUE 
                ORDER BY is_national DESC, display_order
            `);
            
            // Get user's favorite contacts (for quick access)
            let favoriteContacts = [];
            if (userId) {
                [favoriteContacts] = await db.query(`
                    SELECT c.*, cat.name as category_name
                    FROM UserFavoriteContact uf
                    JOIN BarangayContact c ON uf.contact_id = c.contact_id
                    JOIN ContactCategory cat ON c.category_id = cat.category_id
                    WHERE uf.user_id = ?
                    ORDER BY uf.created_at DESC
                    LIMIT 5
                `, [userId]);
            }
            
            // Get Baliuag specific information
            const [baliuagInfo] = await db.query(`
                SELECT * FROM BarangayInfo 
                WHERE city = 'Baliuag' 
                LIMIT 1
            `);
            
            // Log page view
            await db.query(
                'INSERT INTO PageView (page_name, user_id, ip_address) VALUES (?, ?, ?)',
                ['contacts', userId, req.ip]
            );
            
            res.render('contacts', {
                title: language === 'tl' ? 'Emergency at Kontak ng Komunidad' : 'Emergency & Community Contacts',
                currentPath: '/contacts',
                user: req.session.user,
                barangayInfo: barangayInfo[0] || baliuagInfo[0],
                categories: categories,
                emergencyHotlines: emergencyHotlines,
                favoriteContacts: favoriteContacts,
                language: language,
                moment: moment,
                baliuagInfo: baliuagInfo[0]
            });
            
        } catch (error) {
            console.error('Error fetching contacts:', error);
            res.status(500).render('error', {
                message: 'Unable to load contacts',
                error: error
            });
        }
    }
    
    // Get contacts by category (for AJAX)
    static async getContactsByCategory(req, res) {
        try {
            const categoryId = req.params.categoryId;
            const language = req.query.lang || 'en';
            
            const [contacts] = await db.query(`
                SELECT * FROM BarangayContact 
                WHERE category_id = ? AND is_active = TRUE
                ORDER BY is_emergency DESC, display_order
            `, [categoryId]);
            
            res.json({
                success: true,
                contacts: contacts,
                language: language
            });
            
        } catch (error) {
            console.error('Error fetching category contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching contacts'
            });
        }
    }
    
    // Get emergency contacts (for API/chatbot)
    static async getEmergencyContacts(req, res) {
        try {
            const language = req.query.lang || 'en';
            
            const [emergencyContacts] = await db.query(`
                SELECT * FROM BarangayContact 
                WHERE is_emergency = TRUE AND is_active = TRUE
                ORDER BY display_order
            `);
            
            const [hotlines] = await db.query(`
                SELECT * FROM EmergencyHotline 
                WHERE is_active = TRUE 
                ORDER BY is_national DESC, display_order
            `);
            
            // Add Baliuag specific emergency info
            const [baliuagEmergencies] = await db.query(`
                SELECT * FROM BarangayInfo 
                WHERE city = 'Baliuag'
            `);
            
            res.json({
                success: true,
                emergency: emergencyContacts,
                hotlines: hotlines,
                baliuagInfo: baliuagEmergencies[0],
                language: language
            });
            
        } catch (error) {
            console.error('Error fetching emergency contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching emergency contacts'
            });
        }
    }
    
    // Get single contact details
    static async getContactDetails(req, res) {
        try {
            const contactId = req.params.contactId;
            const userId = req.session.user?.user_id;
            const language = req.query.lang || 'en';
            
            // Get contact details
            const [contact] = await db.query(`
                SELECT c.*, cat.name as category_name, cat.name_tagalog as category_name_tagalog, 
                       cat.icon as category_icon
                FROM BarangayContact c
                JOIN ContactCategory cat ON c.category_id = cat.category_id
                WHERE c.contact_id = ?
            `, [contactId]);
            
            if (contact.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Contact not found'
                });
            }
            
            // Log visit
            await db.query(
                'INSERT INTO ContactVisit (contact_id, user_id, ip_address) VALUES (?, ?, ?)',
                [contactId, userId, req.ip]
            );
            
            res.json({
                success: true,
                contact: contact[0],
                language: language
            });
            
        } catch (error) {
            console.error('Error fetching contact details:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching contact details'
            });
        }
    }
    
    // Toggle favorite contact
    static async toggleFavorite(req, res) {
        try {
            const userId = req.session.user?.user_id;
            const contactId = req.params.contactId;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Please login to add favorites'
                });
            }
            
            // Check if already favorited
            const [existing] = await db.query(
                'SELECT * FROM UserFavoriteContact WHERE user_id = ? AND contact_id = ?',
                [userId, contactId]
            );
            
            if (existing.length > 0) {
                // Remove favorite
                await db.query(
                    'DELETE FROM UserFavoriteContact WHERE user_id = ? AND contact_id = ?',
                    [userId, contactId]
                );
                res.json({
                    success: true,
                    action: 'removed',
                    message: 'Contact removed from favorites'
                });
            } else {
                // Add favorite
                await db.query(
                    'INSERT INTO UserFavoriteContact (user_id, contact_id) VALUES (?, ?)',
                    [userId, contactId]
                );
                res.json({
                    success: true,
                    action: 'added',
                    message: 'Contact added to favorites'
                });
            }
            
        } catch (error) {
            console.error('Error toggling favorite:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating favorites'
            });
        }
    }
    
    // Search contacts
    static async searchContacts(req, res) {
        try {
            const query = req.query.q;
            const language = req.query.lang || 'en';
            
            if (!query || query.length < 2) {
                return res.json({
                    success: true,
                    contacts: []
                });
            }
            
            const [contacts] = await db.query(`
                SELECT c.*, cat.name as category_name
                FROM BarangayContact c
                JOIN ContactCategory cat ON c.category_id = cat.category_id
                WHERE c.name LIKE ? OR c.title LIKE ? OR c.department LIKE ? OR c.email LIKE ?
                AND c.is_active = TRUE
                LIMIT 20
            `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);
            
            res.json({
                success: true,
                contacts: contacts,
                language: language
            });
            
        } catch (error) {
            console.error('Error searching contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Error searching contacts'
            });
        }
    }
    
    // Get barangay officials (Baliuag specific)
    static async getBarangayOfficials(req, res) {
        try {
            const barangayName = req.params.barangay || 'San Antonio';
            
            const [officials] = await db.query(`
                SELECT * FROM BarangayContact 
                WHERE category_id = 1 AND is_active = TRUE
                ORDER BY display_order
            `);
            
            const [barangayInfo] = await db.query(`
                SELECT * FROM BarangayInfo 
                WHERE barangay_name = ?
            `, [barangayName]);
            
            res.json({
                success: true,
                officials: officials,
                barangayInfo: barangayInfo[0]
            });
            
        } catch (error) {
            console.error('Error fetching barangay officials:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching barangay officials'
            });
        }
    }
}

module.exports = contactsController;