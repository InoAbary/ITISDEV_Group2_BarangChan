// requestController.js - Handle document requests with database
const conn = require('../config/db');
const path = require('path');
const fs = require('fs').promises;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/requests');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const requestController = {
    // Get all requests for a user
    getUserRequests: async (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        try {
            const userId = req.session.user.id;
            
            // Get requests from database with file info
            const query = `
                SELECT r.*, 
                       COUNT(rf.file_id) as file_count
                FROM RequestForm r
                LEFT JOIN RequestFile rf ON r.request_id = rf.request_id
                WHERE r.user_id = ?
                GROUP BY r.request_id
                ORDER BY r.request_id DESC
            `;
            
            const [requests] = await conn.execute(query, [userId]);
            
            // Format requests for display
            const formattedRequests = requests.map(r => ({
                id: r.request_id,
                documentType: getDocumentTypeFromRequest(r.document_request),
                documentDisplay: formatDocumentType(r.document_request),
                referenceNumber: `REQ-${r.request_id}-${new Date().getFullYear()}`,
                requestedDate: formatDate(r.request_date || new Date()),
                status: r.status || 'Pending',
                statusDisplay: getStatusDisplay(r.status),
                estimatedRelease: calculateEstimatedRelease(r.request_date, r.document_request),
                location: r.address || 'Not specified',
                purpose: extractPurposeFromRequest(r.document_request),
                fileCount: r.file_count
            }));

            // Calculate active requests (pending + accepted)
            const activeRequests = requests.filter(r => 
                r.status === 'Pending' || r.status === 'Accepted'
            ).length;

            res.render('requests', {
                title: 'Document Requests - BarangChan',
                user: req.session.user,
                requests: formattedRequests,
                activeRequests: activeRequests,
                success: req.session.success,
                error: req.session.error
            });

            // Clear session messages
            delete req.session.success;
            delete req.session.error;

        } catch (error) {
            console.error('Error fetching requests:', error);
            res.render('requests', {
                title: 'Document Requests - BarangChan',
                user: req.session.user,
                requests: [],
                activeRequests: 0,
                error: 'Error loading requests'
            });
        }
    },

    // Create a new document request
    createRequest: async (req, res) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        try {
            const userId = req.session.user.id;
            const {
                documentType,
                fullName,
                birthdate,
                birthPlace,
                civilStatus,
                streetAddress,
                barangay,
                city,
                email,
                contactNumber,
                purpose,
                businessName,
                businessType,
                assistanceType,
                annualIncome,
                bloodType,
                agreeTerms
            } = req.body;

            // Validate required fields
            if (!documentType || !fullName || !purpose || !agreeTerms) {
                req.session.error = 'Please fill in all required fields';
                return res.redirect('/client/requests');
            }

            // Check terms agreement
            if (!agreeTerms) {
                req.session.error = 'You must agree to the terms and conditions';
                return res.redirect('/client/requests');
            }

            // Prepare document request details
            const fullAddress = `${streetAddress}, ${barangay}, ${city}`;
            
            // Build document_request string with all relevant information
            let documentRequest = `${getDocumentName(documentType)}`;
            
            // Add document-specific fields
            const additionalInfo = [];
            if (businessName) additionalInfo.push(`Business Name: ${businessName}`);
            if (businessType) additionalInfo.push(`Business Type: ${businessType}`);
            if (assistanceType) additionalInfo.push(`Assistance Type: ${assistanceType}`);
            if (annualIncome) additionalInfo.push(`Annual Income: ₱${annualIncome}`);
            if (bloodType) additionalInfo.push(`Blood Type: ${bloodType}`);
            
            if (additionalInfo.length > 0) {
                documentRequest += `\nAdditional Info: ${additionalInfo.join(', ')}`;
            }

            // Add purpose and personal details
            documentRequest += `\nPurpose: ${purpose}`;
            documentRequest += `\nPersonal Details: ${fullName}, Born: ${birthdate} at ${birthPlace}, Status: ${civilStatus}`;

            // Insert request into database
            const insertQuery = `
                INSERT INTO RequestForm 
                (user_id, email, phone, name, address, document_request, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Pending')
            `;

            const [result] = await conn.execute(insertQuery, [
                userId,
                email || req.session.user.email,
                contactNumber || req.session.user.phone,
                fullName,
                fullAddress,
                documentRequest
            ]);

            const requestId = result.insertId;

            // Handle file uploads if any (for ID pictures, etc.)
            if (req.files && req.files.length > 0) {
                await handleRequestFileUploads(req.files, requestId);
            }

            req.session.success = 'Your document request has been submitted successfully!';
            res.redirect('/client/requests');

        } catch (error) {
            console.error('Error creating request:', error);
            req.session.error = 'Failed to submit request. Please try again.';
            res.redirect('/client/requests');
        }
    },

    // In requestController.js
    getRequestDetails: async (req, res) => {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        try {
            const requestId = req.params.id;
            const userId = req.session.user.id;

            const query = `
                SELECT r.*, 
                    GROUP_CONCAT(
                        JSON_OBJECT('file_id', rf.file_id, 'original_name', rf.original_name, 'file_path', rf.file_path)
                    ) as files
                FROM RequestForm r
                LEFT JOIN RequestFile rf ON r.request_id = rf.request_id
                WHERE r.request_id = ? AND r.user_id = ?
                GROUP BY r.request_id
            `;

            const [requests] = await conn.execute(query, [requestId, userId]);

            if (requests.length === 0) {
                return res.status(404).render('404', { 
                    title: 'Request Not Found',
                    user: req.session.user 
                });
            }

            const request = requests[0];
            
            // Parse files JSON
            let files = [];
            if (request.files) {
                try {
                    files = JSON.parse(`[${request.files}]`);
                } catch (e) {
                    console.error('Error parsing files:', e);
                }
            }

            // Helper functions to pass to view
            const formatDate = (date) => {
                if (!date) return 'TBD';
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            };

            const calculateEstimatedRelease = (requestDate, documentRequest) => {
                if (!requestDate) return 'TBD';
                
                const date = new Date(requestDate);
                let daysToAdd = 2;
                
                if (documentRequest && documentRequest.includes('Business Permit')) {
                    daysToAdd = 5;
                } else if (documentRequest && documentRequest.includes('Barangay ID')) {
                    daysToAdd = 3;
                } else if (documentRequest && documentRequest.includes('Cedula')) {
                    daysToAdd = 0;
                }
                
                date.setDate(date.getDate() + daysToAdd);
                return formatDate(date);
            };

            res.render('request-details', {
                title: 'Request Details - BarangChan',
                user: req.session.user,
                request: request,
                files: files,
                formatDate: formatDate,
                calculateEstimatedRelease: calculateEstimatedRelease
            });

        } catch (error) {
            console.error('Error fetching request details:', error);
            res.status(500).render('error', {
                title: 'Error',
                user: req.session.user,
                error: 'Error loading request details'
            });
        }
    },

    // Update request status (for moderators/admins)
    updateRequestStatus: async (req, res) => {
        if (!req.session.user || (req.session.user.role !== 'moderator' && req.session.user.role !== 'administrator')) {
            return res.status(403).json({ error: 'Access denied' });
        }

        try {
            const requestId = req.params.id;
            const { status, notes } = req.body;

            // Update request status
            const query = `
                UPDATE RequestForm 
                SET status = ?, 
                    document_request = CONCAT(document_request, '\n\n[Update: ', ?, ' at ', NOW(), ']: ', ?)
                WHERE request_id = ?
            `;

            await conn.execute(query, [status, req.session.user.full_name, notes || 'Status updated', requestId]);

            // Log to audit table
            const auditQuery = `
                INSERT INTO request_audit 
                SELECT *, NOW() FROM RequestForm WHERE request_id = ?
            `;
            await conn.execute(auditQuery, [requestId]);

            res.json({ success: true, message: 'Request status updated' });

        } catch (error) {
            console.error('Error updating request:', error);
            res.status(500).json({ error: 'Error updating request' });
        }
    },

    // Cancel request (for users)
    cancelRequest: async (req, res) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        try {
            const requestId = req.params.id;
            const userId = req.session.user.id;

            const query = `
                UPDATE RequestForm 
                SET status = 'Cancelled'
                WHERE request_id = ? AND user_id = ?
            `;

            const [result] = await conn.execute(query, [requestId, userId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Request not found' });
            }

            res.json({ success: true, message: 'Request cancelled' });

        } catch (error) {
            console.error('Error cancelling request:', error);
            res.status(500).json({ error: 'Error cancelling request' });
        }
    }
};

// Helper function to handle file uploads
async function handleRequestFileUploads(files, requestId) {
    if (!files || files.length === 0) return;
    
    const uploadPromises = files.map(async (file) => {
        const query = `
            INSERT INTO RequestFile 
            (request_id, original_name, stored_name, mime_type, size_bytes, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const filePath = `/uploads/requests/${file.filename}`;

        return conn.execute(query, [
            requestId,
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
            filePath
        ]);
    });

    await Promise.all(uploadPromises);
}

// Helper function to get document name from document_request string
function getDocumentTypeFromRequest(documentRequest) {
    if (!documentRequest) return 'Unknown';
    if (documentRequest.includes('Barangay Clearance')) return 'barangay-clearance';
    if (documentRequest.includes('Certificate of Indigency')) return 'certificate-indigency';
    if (documentRequest.includes('Business Permit')) return 'business-permit';
    if (documentRequest.includes('Certificate of Residency')) return 'certificate-residency';
    if (documentRequest.includes('Community Tax Certificate')) return 'cedula';
    if (documentRequest.includes('Barangay ID')) return 'barangay-id';
    return 'other';
}

// Helper function to format document type for display
function formatDocumentType(documentRequest) {
    if (!documentRequest) return 'Unknown Document';
    const firstLine = documentRequest.split('\n')[0];
    return firstLine || 'Document Request';
}

// Helper function to get status display
function getStatusDisplay(status) {
    switch(status) {
        case 'Pending': return 'Pending';
        case 'Accepted': return 'Processing';
        case 'Cancelled': return 'Cancelled';
        default: return status;
    }
}

// Helper function to calculate estimated release date
function calculateEstimatedRelease(requestDate, documentRequest) {
    if (!requestDate) return 'TBD';
    
    const date = new Date(requestDate);
    let daysToAdd = 2; // default 2 days
    
    if (documentRequest && documentRequest.includes('Business Permit')) {
        daysToAdd = 5;
    } else if (documentRequest && documentRequest.includes('Barangay ID')) {
        daysToAdd = 3;
    } else if (documentRequest && documentRequest.includes('Cedula')) {
        daysToAdd = 0; // same day
    }
    
    date.setDate(date.getDate() + daysToAdd);
    return formatDate(date);
}

// Helper function to extract purpose from document_request
function extractPurposeFromRequest(documentRequest) {
    if (!documentRequest) return '';
    const purposeMatch = documentRequest.match(/Purpose: (.*?)(?:\n|$)/);
    return purposeMatch ? purposeMatch[1] : '';
}

// Helper function to get document name for storage
function getDocumentName(docType) {
    const names = {
        'barangay-clearance': 'Barangay Clearance',
        'certificate-indigency': 'Certificate of Indigency',
        'business-permit': 'Business Permit',
        'certificate-residency': 'Certificate of Residency',
        'cedula': 'Community Tax Certificate (Cedula)',
        'barangay-id': 'Barangay ID'
    };
    return names[docType] || 'Document Request';
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

module.exports = requestController;