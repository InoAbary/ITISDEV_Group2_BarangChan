-- =====================================
-- Reset Section - Complete Drop All Tables
-- =====================================

DROP SCHEMA IF EXISTS BarangChan;
CREATE SCHEMA BarangChan;
USE BarangChan;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop all tables in correct order (dependent tables first)
DROP TABLE IF EXISTS StatusFiles;
DROP TABLE IF EXISTS ComplaintFiles;
DROP TABLE IF EXISTS RequestFile;
DROP TABLE IF EXISTS FormDownload;
DROP TABLE IF EXISTS GovernmentForm;
DROP TABLE IF EXISTS PostComment;
DROP TABLE IF EXISTS PostLike;
DROP TABLE IF EXISTS ForumReply;
DROP TABLE IF EXISTS ForumTopic;
DROP TABLE IF EXISTS StatusPost;
DROP TABLE IF EXISTS ComplaintForm;
DROP TABLE IF EXISTS RequestForm;
DROP TABLE IF EXISTS ContactVisit;
DROP TABLE IF EXISTS UserFavoriteContact;
DROP TABLE IF EXISTS PageView;
DROP TABLE IF EXISTS BarangayContact;
DROP TABLE IF EXISTS ContactCategory;
DROP TABLE IF EXISTS EmergencyHotline;
DROP TABLE IF EXISTS BarangayInfo;
DROP TABLE IF EXISTS Address;
DROP TABLE IF EXISTS User;
DROP TABLE IF EXISTS status_audit;
DROP TABLE IF EXISTS user_audit;
DROP TABLE IF EXISTS request_audit;
DROP TABLE IF EXISTS complaint_audit;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================
-- Core Tables
-- =====================================

CREATE TABLE User (
	user_id INT AUTO_INCREMENT PRIMARY KEY,
	username VARCHAR(100),
	first_name VARCHAR(100),
	last_name VARCHAR(100),
	middle_name VARCHAR(100),
	email VARCHAR(100) UNIQUE,
	phone VARCHAR(100),
	password VARCHAR(100),
	last_login DATETIME,
	status VARCHAR(20) DEFAULT 'Active',
	role ENUM('resident','moderator', 'administrator') DEFAULT 'resident',
	photo VARCHAR(100),
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Address (
    address_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    city VARCHAR(100),
    barangay VARCHAR(100),
    street VARCHAR(100),
    zip VARCHAR(4),

    FOREIGN KEY (user_id)
    REFERENCES User(user_id)
    ON DELETE CASCADE
);

-- =====================================
-- Status Posts
-- =====================================

CREATE TABLE StatusPost (
	post_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	date_posted DATETIME DEFAULT CURRENT_TIMESTAMP,
	title VARCHAR(100) NOT NULL,
	body VARCHAR(250),
	status ENUM('Pending','Resolved','Closed') DEFAULT 'Pending',
    type ENUM('update','query','suggestion','complaint','announcement','emergency') DEFAULT 'update',
    urgency ENUM('low','medium','high','emergency') DEFAULT 'low',
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    shares_count INT DEFAULT 0,
    is_official BOOLEAN DEFAULT FALSE,

	FOREIGN KEY (user_id)
	REFERENCES User(user_id)
	ON DELETE CASCADE
);

CREATE TABLE StatusFiles (
	file_id INT AUTO_INCREMENT PRIMARY KEY,
	post_id INT NOT NULL,
	original_name VARCHAR(255),
	stored_name VARCHAR(255),
	mime_type VARCHAR(120),
	size_bytes BIGINT,
	file_path TEXT,
	uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (post_id)
	REFERENCES StatusPost(post_id)
	ON DELETE CASCADE
);

CREATE TABLE PostComment (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES StatusPost(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE PostLike (
    like_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_like (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES StatusPost(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE ForumTopic (
    topic_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category ENUM('general','concern','suggestion','event','announcement','emergency') DEFAULT 'general',
    urgency ENUM('low','medium','high','emergency') DEFAULT 'low',
    tags VARCHAR(255),
    views INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_official BOOLEAN DEFAULT FALSE,
    status ENUM('active','closed','archived') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE ForumReply (
    reply_id INT AUTO_INCREMENT PRIMARY KEY,
    topic_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES ForumTopic(topic_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- =====================================
-- Complaint Forms
-- =====================================

CREATE TABLE ComplaintForm (
	complaint_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NULL,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	allegations VARCHAR(1250),
	narration VARCHAR(1250),
	status ENUM('Under Review','Resolved','Cancelled') DEFAULT 'Under Review',
    complaint_date DATETIME DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (user_id)
	REFERENCES User(user_id)
	ON DELETE CASCADE
);

CREATE TABLE ComplaintFiles (
	file_id INT AUTO_INCREMENT PRIMARY KEY,
	complaint_id INT NOT NULL,
	original_name VARCHAR(255),
	stored_name VARCHAR(255),
	mime_type VARCHAR(120),
	size_bytes BIGINT,
	file_path TEXT,
	uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (complaint_id)
	REFERENCES ComplaintForm(complaint_id)
	ON DELETE CASCADE
);

-- =====================================
-- Request Forms
-- =====================================

CREATE TABLE RequestForm (
	request_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	document_request VARCHAR(250),
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
	status ENUM('Pending','Accepted','Cancelled') DEFAULT 'Pending',

	FOREIGN KEY (user_id)
	REFERENCES User(user_id)
	ON DELETE CASCADE
);

CREATE TABLE RequestFile (
	file_id INT AUTO_INCREMENT PRIMARY KEY,
	request_id INT NOT NULL,
	original_name VARCHAR(255),
	stored_name VARCHAR(255),
	mime_type VARCHAR(120),
	size_bytes BIGINT,
	file_path TEXT,
	uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (request_id)
	REFERENCES RequestForm(request_id)
	ON DELETE CASCADE
);

-- =====================================
-- Audit Tables
-- =====================================

CREATE TABLE status_audit (
	audit_id INT AUTO_INCREMENT PRIMARY KEY,
	post_id INT,
	user_id INT,
	date_posted DATETIME,
	title VARCHAR(100),
	body VARCHAR(250),
	status ENUM('Pending','Resolved','Closed'),
	date_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_audit (
	audit_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT,
	username VARCHAR(100),
	first_name VARCHAR(100),
	last_name VARCHAR(100),
	email VARCHAR(100),
	phone VARCHAR(100),
	password VARCHAR(100),
	address VARCHAR(100),
	last_login DATETIME,
	status VARCHAR(20),
	role ENUM('admin','user'),
	date_deleted DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE request_audit (
	audit_id INT AUTO_INCREMENT PRIMARY KEY,
	request_id INT,
	user_id INT,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	document_request VARCHAR(1250),
	status ENUM('Pending','Accepted','Cancelled'),
	date_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complaint_audit (
	audit_id INT AUTO_INCREMENT PRIMARY KEY,
	complaint_id INT,
	user_id INT,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	allegations VARCHAR(1250),
	narration VARCHAR(1250),
	status ENUM('Under Review','Resolved','Cancelled'),
    date_updated DATETIME DEFAULT CURRENT_TIMESTAMP  
);

-- =====================================
-- Government Forms
-- =====================================

CREATE TABLE IF NOT EXISTS GovernmentForm (
    form_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM('barangay', 'national', 'psa', 'bpls', 'social', 'education', 'health', 'others') DEFAULT 'others',
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT,
    file_type VARCHAR(50),
    form_code VARCHAR(50),
    version VARCHAR(20),
    is_featured BOOLEAN DEFAULT FALSE,
    download_count INT DEFAULT 0,
    last_updated DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS FormDownload (
    download_id INT AUTO_INCREMENT PRIMARY KEY,
    form_id INT,
    user_id INT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY (form_id) REFERENCES GovernmentForm(form_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE SET NULL
);

-- =====================================
-- Contacts Tables (Baliuag Localized)
-- =====================================

-- Categories for contacts
CREATE TABLE IF NOT EXISTS ContactCategory (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_tagalog VARCHAR(100),
    icon VARCHAR(50),
    color VARCHAR(20),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main contacts table
CREATE TABLE IF NOT EXISTS BarangayContact (
    contact_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    title VARCHAR(200),
    department VARCHAR(200),
    phone_landline VARCHAR(50),
    phone_mobile VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    office_hours VARCHAR(200),
    office_hours_tagalog VARCHAR(200),
    is_emergency BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category_id) REFERENCES ContactCategory(category_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES User(user_id) ON DELETE SET NULL
);

-- Emergency hotlines
CREATE TABLE IF NOT EXISTS EmergencyHotline (
    hotline_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_tagalog VARCHAR(100),
    number VARCHAR(20) NOT NULL,
    description TEXT,
    description_tagalog TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    is_national BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Barangay information (Baliuag specific)
CREATE TABLE IF NOT EXISTS BarangayInfo (
    info_id INT AUTO_INCREMENT PRIMARY KEY,
    barangay_name VARCHAR(100) NOT NULL,
    barangay_name_tagalog VARCHAR(100),
    city VARCHAR(100),
    province VARCHAR(100) DEFAULT 'Bulacan',
    region VARCHAR(100) DEFAULT 'Central Luzon',
    barangay_captain VARCHAR(100),
    captain_contact VARCHAR(50),
    secretary VARCHAR(100),
    secretary_contact VARCHAR(50),
    treasurer VARCHAR(100),
    treasurer_contact VARCHAR(50),
    hall_address TEXT,
    hall_phone VARCHAR(50),
    hall_email VARCHAR(100),
    office_hours VARCHAR(200),
    office_hours_tagalog VARCHAR(200),
    facebook_page VARCHAR(255),
    website VARCHAR(255),
    evacuation_center TEXT,
    evacuation_center_address TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User favorite contacts
CREATE TABLE IF NOT EXISTS UserFavoriteContact (
    favorite_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contact_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES BarangayContact(contact_id) ON DELETE CASCADE,
    UNIQUE KEY unique_favorite (user_id, contact_id)
);

-- Contact visit tracking
CREATE TABLE IF NOT EXISTS ContactVisit (
    visit_id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    user_id INT NULL,
    ip_address VARCHAR(45),
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (contact_id) REFERENCES BarangayContact(contact_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE SET NULL
);

-- Page view tracking
CREATE TABLE IF NOT EXISTS PageView (
    view_id INT AUTO_INCREMENT PRIMARY KEY,
    page_name VARCHAR(100),
    user_id INT NULL,
    ip_address VARCHAR(45),
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE SET NULL
);

-- =====================================
-- Insert Default Users (Resident, Moderator, Administrator)
-- =====================================

-- Password hashes for testing (all passwords are: resident123, moderator123, admin123)
-- Using bcrypt hash format

-- Resident Account
INSERT INTO User (username, first_name, last_name, middle_name, email, phone, password, role, status, created_at) VALUES
('juan.delacruz', 'Juan', 'Dela Cruz', 'Santos', 'resident@barangchan.ph', '09171234567', '$2b$10$I/61TWRnh83J5A5QWou61e4O.Zp9/1eRk4YnIiqqjtQjosx4Y1G2S', 'resident', 'Active', NOW());

-- Moderator Account
INSERT INTO User (username, first_name, last_name, middle_name, email, phone, password, role, status, created_at) VALUES
('maria.santos', 'Maria', 'Santos', 'Reyes', 'moderator@barangchan.ph', '09271234568', '$2b$10$Eq2IDcxNmCBOTO6cFlXh/uF0dNlxAgvGMRBuAMijtootnT55vUfiC', 'moderator', 'Active', NOW());

-- Administrator Account
INSERT INTO User (username, first_name, last_name, middle_name, email, phone, password, role, status, created_at) VALUES
('admin.barangchan', 'Admin', 'User', 'BarangChan', 'admin@barangchan.ph', '09181234569', '$2b$10$S4LKu6/XbF2R7zXy6mDRZ.ZvPk.1z3HU7ENLgASHinFEfOVh4/pAi', 'administrator', 'Active', NOW());

-- Note: You need to generate actual bcrypt hashes. For testing, you can create them using:
-- const bcrypt = require('bcrypt');
-- const hash = bcrypt.hashSync('password123', 10);
-- Then replace the placeholder hashes above.

-- Insert Addresses for Users
INSERT INTO Address (user_id, city, barangay, street, zip) VALUES
(1, 'Baliuag', 'San Antonio', '123 Purok 3', '3006'),
(2, 'Baliuag', 'San Antonio', '456 Purok 5', '3006'),
(3, 'Baliuag', 'San Antonio', '789 Purok 2', '3006');

-- =====================================
-- Insert Default Categories (Baliuag)
-- =====================================

INSERT INTO ContactCategory (name, name_tagalog, icon, color, display_order) VALUES
('Barangay Hall', 'Bulwagang Barangay', 'fa-landmark', 'blue', 1),
('Emergency Services', 'Pang-emergency na Serbisyo', 'fa-exclamation-circle', 'red', 2),
('Health Services', 'Serbisyong Pangkalusugan', 'fa-hospital', 'green', 3),
('Utilities & Public Services', 'Mga Utility at Pampublikong Serbisyo', 'fa-tools', 'orange', 4),
('Social Welfare', 'Pangkapakanang Panlipunan', 'fa-hand-holding-heart', 'amber', 5),
('Municipal Office', 'Opisina ng Munisipyo', 'fa-city', 'purple', 6);

-- =====================================
-- Insert Default Emergency Hotlines (Baliuag)
-- =====================================

INSERT INTO EmergencyHotline (name, name_tagalog, number, description, description_tagalog, icon, color, is_national, display_order) VALUES
('National Emergency', 'Pambansang Emergency', '911', 'General emergencies (Police, Fire, Medical)', 'Pangkalahatang emergency (Pulis, Sunog, Medikal)', 'fa-phone-alt', 'red', TRUE, 1),
('PNP Hotline', 'PNP Hotline', '117', 'Philippine National Police', 'Pambansang Pulisya ng Pilipinas', 'fa-shield-alt', 'blue', TRUE, 2),
('BFP Hotline', 'BFP Hotline', '160', 'Bureau of Fire Protection', 'Kawanihan ng Pamatay-Sunog', 'fa-fire-extinguisher', 'orange', TRUE, 3),
('Red Cross', 'Krus na Pula', '143', 'Philippine Red Cross', 'Pambansang Krus na Pula', 'fa-ambulance', 'green', TRUE, 4),
('Baliuag PNP', 'Pulisya ng Baliuag', '0927 123 4567', 'Baliuag Municipal Police Station', 'Himpilan ng Pulisya ng Baliuag', 'fa-shield-alt', 'blue', FALSE, 5),
('Baliuag BFP', 'BFP Baliuag', '0917 123 4568', 'Baliuag Fire Station', 'Himpilan ng Bumbero ng Baliuag', 'fa-fire-extinguisher', 'orange', FALSE, 6);

-- =====================================
-- Insert Baliuag Barangay Info
-- =====================================

INSERT INTO BarangayInfo (
    barangay_name, barangay_name_tagalog, city, province, region,
    barangay_captain, captain_contact, secretary, secretary_contact,
    treasurer, treasurer_contact, hall_address, hall_phone, hall_email,
    office_hours, office_hours_tagalog, facebook_page, evacuation_center,
    evacuation_center_address
) VALUES (
    'San Antonio', 'San Antonio', 'Baliuag', 'Bulacan', 'Central Luzon',
    'Hon. Maria Concepcion R. Santos', '0917 123 4567',
    'Juan Miguel A. Dela Cruz', '0922 123 4568',
    'Teresita M. Reyes', '0918 123 4569',
    'Purok 3, Barangay San Antonio, Baliuag, Bulacan',
    '(044) 123-4567', 'barangay.sanantonio@baliuag.gov.ph',
    '8:00 AM - 5:00 PM (Monday - Friday)', '8:00 AM - 5:00 PM (Lunes - Biyernes)',
    'https://facebook.com/barangaysanantonio.baliuag',
    'San Antonio Elementary School', 'Purok 4, Barangay San Antonio, Baliuag, Bulacan'
);

-- =====================================
-- Insert Baliuag Contacts
-- =====================================

-- Barangay Hall (category_id 1)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(1, 'Kapitan ng Barangay', 'Hon. Maria Concepcion R. Santos', '(044) 123-4567', '0917 123 4567', 'kapitan@sanantonio.baliuag.gov.ph', 
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 1),
(1, 'Kalihim ng Barangay', 'Juan Miguel A. Dela Cruz', '(044) 123-4568', '0922 123 4568', 'kalihim@sanantonio.baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 2),
(1, 'Tresyurera ng Barangay', 'Teresita M. Reyes', '(044) 123-4569', '0918 123 4569', 'tresyurera@sanantonio.baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 3),
(1, 'Bulwagang Barangay', 'Barangay Hall - San Antonio', '(044) 123-4560', NULL, 'barangay@sanantonio.baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 4);

-- Emergency Services (category_id 2)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(2, 'Barangay Tanod', 'Barangay Peacekeepers', '(044) 123-4570', '0917 123 4570', 'tanod@sanantonio.baliuag.gov.ph',
 '24/7', '24 oras', TRUE, 1),
(2, 'Barangay Disaster Response', 'BDRRMC - San Antonio', '(044) 123-4571', '0922 123 4571', 'bdrrmc@sanantonio.baliuag.gov.ph',
 '24/7', '24 oras', TRUE, 2);

-- Health Services (category_id 3)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(3, 'Barangay Health Center', 'Dr. Maria Theresa A. Cruz', '(044) 123-4572', '0917 123 4572', 'healthcenter@sanantonio.baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri) • 8:00 AM - 12:00 PM (Sat)', '8:00 AM - 5:00 PM (Lunes-Biyernes) • 8:00 AM - 12:00 PM (Sabado)', FALSE, 1),
(3, 'Barangay Nutrition Scholar', 'Luzviminda M. Garcia', '(044) 123-4573', '0922 123 4573', 'bns@sanantonio.baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 2),
(3, 'Barangay Midwife', 'Elena R. Mendoza', '(044) 123-4574', '0918 123 4574', NULL,
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 3);

-- Utilities (category_id 4)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(4, 'Baliuag Water District', 'Baliuag Water District Office', '(044) 766-1234', NULL, 'customerservice@baliwagwater.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 1),
(4, 'Meralco - Baliuag Office', 'Meralco Baliuag Branch', '16211', '0917 123 4765', 'customerservice@meralco.com.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 2),
(4, 'Globe Telecom', 'Globe Customer Service', '211', NULL, NULL,
 '24/7', '24 oras', FALSE, 3),
(4, 'Smart Communications', 'Smart Customer Service', '8888', NULL, NULL,
 '24/7', '24 oras', FALSE, 4);

-- Social Welfare (category_id 5)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(5, 'MSWDO - Baliuag', 'Municipal Social Welfare Office', '(044) 766-5678', NULL, 'mswdo@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 1),
(5, 'Senior Citizen Affairs', 'Office of Senior Citizen Affairs', '(044) 766-5679', NULL, 'osca@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 2),
(5, 'PWD Affairs Office', 'Persons with Disability Affairs', '(044) 766-5680', NULL, 'pwd@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 3);

-- Municipal Office (category_id 6)
INSERT INTO BarangayContact (category_id, name, title, phone_landline, phone_mobile, email, 
    office_hours, office_hours_tagalog, is_emergency, display_order) VALUES
(6, 'Baliuag Municipal Hall', 'Mayor''s Office', '(044) 766-1111', NULL, 'mayor@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 1),
(6, 'Municipal Planning Office', 'MPDO - Baliuag', '(044) 766-1112', NULL, 'mplanning@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 2),
(6, 'Municipal Engineering Office', 'MEO - Baliuag', '(044) 766-1113', NULL, 'engineering@baliuag.gov.ph',
 '8:00 AM - 5:00 PM (Mon-Fri)', '8:00 AM - 5:00 PM (Lunes-Biyernes)', FALSE, 3);

-- =====================================
-- Display verification
-- =====================================

SELECT '=== Users ===' as '';
SELECT * FROM User;

UPDATE User 
SET password = '$2b$10$I/61TWRnh83J5A5QWou61e4O.Zp9/1eRk4YnIiqqjtQjosx4Y1G2S'
WHERE email = 'resident@barangchan.ph';

-- Update Moderator password
UPDATE User 
SET password = '$2b$10$Eq2IDcxNmCBOTO6cFlXh/uF0dNlxAgvGMRBuAMijtootnT55vUfiC'
WHERE email = 'moderator@barangchan.ph';

-- Update Administrator password
UPDATE User 
SET password = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE email = 'admin@barangchan.ph';

SELECT '=== Addresses ===' as '';
SELECT a.address_id, u.first_name, u.last_name, a.barangay, a.city, a.street 
FROM Address a 
JOIN User u ON a.user_id = u.user_id;

SELECT '=== Barangay Info ===' as '';
SELECT barangay_name, city, province, barangay_captain FROM BarangayInfo;

SELECT '=== Contact Categories ===' as '';
SELECT category_id, name, name_tagalog FROM ContactCategory;

SELECT '=== Emergency Hotlines ===' as '';
SELECT name, number, is_national FROM EmergencyHotline;