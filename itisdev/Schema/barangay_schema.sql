-- =====================================
-- Reset Section
-- =====================================

DROP SCHEMA IF EXISTS BarangChan;
CREATE SCHEMA BarangChan;
USE BarangChan;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS StatusFiles;
DROP TABLE IF EXISTS ComplaintFiles;
DROP TABLE IF EXISTS RequestFile;

DROP TABLE IF EXISTS StatusPost;
DROP TABLE IF EXISTS ComplaintForm;
DROP TABLE IF EXISTS RequestForm;

DROP TABLE IF EXISTS User;

DROP TABLE IF EXISTS Address;

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
	email VARCHAR(100),
	phone VARCHAR(100),
	password VARCHAR(100),
	last_login DATETIME,
	status VARCHAR(20) DEFAULT 'Active',
	role ENUM('admin','user') DEFAULT 'user',
	photo VARCHAR(100)
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

-- =====================================
-- Complaint Forms
-- =====================================

CREATE TABLE ComplaintForm (
	complaint_id INT AUTO_INCREMENT PRIMARY KEY,
	user_id INT NOT NULL,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	allegations VARCHAR(250),
	narration VARCHAR(250),
	status ENUM('Pending','Resolved','Cancelled') DEFAULT 'Pending',

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
	post_id INT,
	user_id INT,
	date_posted DATETIME,
	title VARCHAR(100),
	body VARCHAR(250),
	status ENUM('Pending','Resolved','Closed'),
	date_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_audit (
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
	request_id INT,
	user_id INT,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	document_request VARCHAR(250),
	status ENUM('Pending','Accepted','Cancelled')
);

CREATE TABLE complaint_audit (
	complaint_id INT,
	user_id INT,
	email VARCHAR(100),
	phone VARCHAR(100),
	name VARCHAR(100),
	address VARCHAR(100),
	allegations VARCHAR(250),
	narration VARCHAR(250),
	status ENUM('Pending','Resolved','Cancelled')
);

INSERT INTO User(email) VALUES('test@gmail.com');
