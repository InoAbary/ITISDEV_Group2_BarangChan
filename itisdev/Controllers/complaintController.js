// complaintController.js - Handle complaint operations with database
const conn = require('../config/db');
const path = require('path');
const fs = require('fs').promises;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/complaints');

// Helper function to extract title from allegations
function extractTitleFromAllegations(allegations) {
    if (!allegations) return 'Untitled Complaint';
    // Title is the first line
    return allegations.split('\n')[0] || 'Untitled Complaint';
}

// Helper function to get urgency from allegations
function getUrgencyFromAllegations(allegations) {
    if (!allegations) return 'medium';
    if (allegations.toLowerCase().includes('emergency')) return 'emergency';
    if (allegations.toLowerCase().includes('urgent')) return 'high';
    if (allegations.toLowerCase().includes('urgency: low')) return 'low';
    if (allegations.toLowerCase().includes('urgency: medium')) return 'medium';
    if (allegations.toLowerCase().includes('urgency: high')) return 'high';
    return 'medium';
}
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

    const complaintController = {
        // Get all complaints for a user
        getUserComplaints: async (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        try {
            const userId = req.session.user.id;
            
            // Get complaints from database - include both user's complaints AND anonymous complaints
            // if you want users to see anonymous complaints they created while logged out
            const query = `
                SELECT c.*, 
                    COUNT(cf.file_id) as file_count
                FROM ComplaintForm c
                LEFT JOIN ComplaintFiles cf ON c.complaint_id = cf.complaint_id
                WHERE c.user_id = ? OR (c.name = 'ANONYMOUS' AND c.email = ?)
                GROUP BY c.complaint_id
                ORDER BY c.complaint_id DESC
            `;
            
            // This assumes anonymous complaints are linked by email
            // You might want a different strategy
            const [complaints] = await conn.execute(query, [userId, req.session.user.email]);
            
            // Format complaints for display
            const formattedComplaints = complaints.map(c => ({
                id: c.complaint_id,
                title: extractTitleFromAllegations(c.allegations),
                category: getCategoryFromAllegations(c.allegations),
                referenceNumber: `CMP-${c.complaint_id}-${new Date(c.complaint_date || Date.now()).getFullYear()}`,
                filedDate: formatDate(c.complaint_date || new Date()),
                status: c.status || 'Pending',
                urgency: getUrgencyFromAllegations(c.allegations),
                location: c.address || 'Not specified',
                lastUpdate: formatDate(c.complaint_date || new Date()),
                fileCount: c.file_count,
                isAnonymous: c.name === 'ANONYMOUS'
            }));

            res.render('complaints', {
                title: 'File a Complaint - BarangChan',
                user: req.session.user,
                complaints: formattedComplaints,
                activeComplaints: complaints.filter(c => c.status === 'Pending' || c.status === 'Investigating').length,
                success: req.session.success,
                error: req.session.error
            });

            delete req.session.success;
            delete req.session.error;

        } catch (error) {
            console.error('Error fetching complaints:', error);
            res.render('complaints', {
                title: 'File a Complaint - BarangChan',
                user: req.session.user,
                complaints: [],
                activeComplaints: 0,
                error: 'Error loading complaints'
            });
        }
    },

    // Create a new complaint
    // complaintController.js - Updated createComplaint function

createComplaint: async (req, res) => {
    if (!req.session.user && req.body.isAnonymous !== 'true') {
        return res.status(401).json({ error: 'Not logged in' });
    }

    try {
        const userId = req.session.user ? req.session.user.id : null;
        const {
            complaintType,
            isAnonymous,
            complainantName,
            complainantContact,
            complainantEmail,
            category,
            urgency,
            location,
            incidentDate,
            incidentTime,
            title,
            description,
            involvedParties,
            witnesses,
            previouslyReported,
            immediateAction,
            contactMethod,
            agreeTerms
        } = req.body;

        // Validate required fields
        if (!title || !description || !location) {
            req.session.error = 'Please fill in all required fields';
            return res.redirect('/client/complaints');
        }

        // Check terms agreement
        if (!agreeTerms) {
            req.session.error = 'You must agree to the terms and conditions';
            return res.redirect('/client/complaints');
        }

        // Prepare complaint data for anonymous or identified user
        let complainantInfo;
        let name, email, phone;
        
        if (isAnonymous === 'true') {
            // Anonymous complaint
            name = 'ANONYMOUS';
            email = 'anonymous@barangchan.local';
            phone = 'N/A';
            complainantInfo = 'Anonymous Complaint';
        } else {
            // Identified complaint - use provided info or session data
            name = complainantName || (req.session.user ? req.session.user.full_name : 'Unknown');
            email = complainantEmail || (req.session.user ? req.session.user.email : '');
            phone = complainantContact || (req.session.user ? req.session.user.phone : '');
            complainantInfo = `${name} (${phone})`;
        }

        const allegations = `${title}\nCategory: ${category}\nLocation: ${location}\nDate/Time: ${incidentDate} ${incidentTime}\nUrgency: ${urgency}`;
        
        const narration = `
        Description: ${description}
        Involved Parties: ${involvedParties || 'None'}
        Witnesses: ${witnesses || 'None'}
        Previously Reported: ${previouslyReported ? 'Yes' : 'No'}
        Immediate Action Required: ${immediateAction ? 'Yes' : 'No'}
        Contact Method: ${contactMethod || 'Not specified'}
        Complainant: ${complainantInfo}
        Anonymous: ${isAnonymous === 'true' ? 'Yes' : 'No'}
                `.trim();

                // Insert complaint into database
                let insertQuery;
                let params;
                
                if (userId) {
                    // User is logged in
                    insertQuery = `
                        INSERT INTO ComplaintForm 
                        (user_id, email, phone, name, address, allegations, narration, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')
                    `;
                    params = [userId, email, phone, name, location, allegations, narration];
                } else {
                    // Anonymous - no user_id
                    insertQuery = `
                        INSERT INTO ComplaintForm 
                        (email, phone, name, address, allegations, narration, status)
                        VALUES (?, ?, ?, ?, ?, ?, 'Pending')
                    `;
                    params = [email, phone, name, location, allegations, narration];
                }

                const [result] = await conn.execute(insertQuery, params);
                const complaintId = result.insertId;

                // Handle file uploads if any
                if (req.files && req.files.length > 0) {
                    await handleFileUploads(req.files, complaintId);
                }

                req.session.success = 'Your complaint has been submitted successfully!';
                res.redirect('/client/complaints');

            } catch (error) {
                console.error('Error creating complaint:', error);
                req.session.error = 'Failed to submit complaint. Please try again.';
                res.redirect('/client/complaints');
            }
    },

    // Get single complaint details
    getComplaintDetails: async (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        try {
            const complaintId = req.params.id;
            const userId = req.session.user.id;

            const query = `
                SELECT c.*, 
                       GROUP_CONCAT(
                           JSON_OBJECT('file_id', cf.file_id, 'original_name', cf.original_name, 'file_path', cf.file_path)
                       ) as files
                FROM ComplaintForm c
                LEFT JOIN ComplaintFiles cf ON c.complaint_id = cf.complaint_id
                WHERE c.complaint_id = ? AND c.user_id = ?
                GROUP BY c.complaint_id
            `;

            const [complaints] = await conn.execute(query, [complaintId, userId]);

            if (complaints.length === 0) {
                return res.status(404).render('404', { 
                    title: 'Complaint Not Found',
                    user: req.session.user 
                });
            }

            const complaint = complaints[0];
            
            // Parse files JSON
            let files = [];
            if (complaint.files) {
                try {
                    files = JSON.parse(`[${complaint.files}]`);
                } catch (e) {
                    console.error('Error parsing files:', e);
                }
            }

            res.render('complaint-details', {
                title: 'Complaint Details - BarangChan',
                user: req.session.user,
                complaint: complaint,
                files: files
            });

        } catch (error) {
            console.error('Error fetching complaint details:', error);
            res.status(500).render('error', {
                title: 'Error',
                user: req.session.user,
                error: 'Error loading complaint details'
            });
        }
    },

    // Update complaint status (for moderators/admins)
    updateComplaintStatus: async (req, res) => {
        if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            const complaintId = req.params.id;
            const { status, resolution_notes } = req.body;

            // Update complaint status
            const query = `
                UPDATE ComplaintForm 
                SET status = ?, 
                    resolution_notes = ?,
                    resolved_date = CASE WHEN ? = 'Resolved' THEN NOW() ELSE resolved_date END
                WHERE complaint_id = ?
            `;

            await conn.execute(query, [status, resolution_notes, status, complaintId]);

            // Log to audit table
            const auditQuery = `
                INSERT INTO complaint_audit 
                SELECT *, NOW() FROM ComplaintForm WHERE complaint_id = ?
            `;
            await conn.execute(auditQuery, [complaintId]);

            res.json({ success: true, message: 'Complaint status updated' });

        } catch (error) {
            console.error('Error updating complaint:', error);
            res.status(500).json({ error: 'Error updating complaint' });
        }
    },

    // Add comment to complaint
    addComment: async (req, res) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        try {
            const complaintId = req.params.id;
            const userId = req.session.user.id;
            const { comment } = req.body;

            // You might want to create a ComplaintComments table
            // For now, we'll append to narration
            const query = `
                UPDATE ComplaintForm 
                SET narration = CONCAT(narration, '\n\n[Comment from ', ?, ' at ', NOW(), ']:\n', ?)
                WHERE complaint_id = ? AND (user_id = ? OR ? IN (SELECT user_id FROM User WHERE role IN ('moderator', 'administrator')))
            `;

            await conn.execute(query, [
                req.session.user.full_name,
                comment,
                complaintId,
                userId,
                userId
            ]);

            res.json({ success: true, message: 'Comment added' });

        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({ error: 'Error adding comment' });
        }
    }
};

// Helper function to handle file uploads
async function handleFileUploads(files, complaintId) {
    const uploadPromises = files.map(async (file) => {
        const query = `
            INSERT INTO ComplaintFiles 
            (complaint_id, original_name, stored_name, mime_type, size_bytes, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const storedName = `${Date.now()}-${file.originalname}`;
        const filePath = `/uploads/complaints/${storedName}`;

        // Move file to permanent location
        const tempPath = file.path;
        const permPath = path.join(__dirname, '../public/uploads/complaints', storedName);
        await fs.rename(tempPath, permPath);

        return conn.execute(query, [
            complaintId,
            file.originalname,
            storedName,
            file.mimetype,
            file.size,
            filePath
        ]);
    });

    await Promise.all(uploadPromises);
}

// Helper function to determine category from allegations
function getCategoryFromAllegations(allegations) {
    if (!allegations) return 'Other';
    if (allegations.toLowerCase().includes('noise')) return 'Noise';
    if (allegations.toLowerCase().includes('waste')) return 'Waste';
    if (allegations.toLowerCase().includes('animal')) return 'Animal';
    if (allegations.toLowerCase().includes('peace')) return 'Peace & Order';
    if (allegations.toLowerCase().includes('infrastructure')) return 'Infrastructure';
    return 'Other';
}

// Helper function to determine urgency from narration
function getUrgencyFromNarration(narration) {
    if (!narration) return 'low';
    if (narration.toLowerCase().includes('emergency')) return 'emergency';
    if (narration.toLowerCase().includes('urgent')) return 'high';
    if (narration.toLowerCase().includes('asap')) return 'high';
    return 'medium';
}

// Helper function to format date
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

module.exports = complaintController;