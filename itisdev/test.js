require("dotenv").config();

const mysql = require("mysql2");

const conn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

conn.connect((err)=> {
    if (err) {
        console.log("Failed connection")
        return;
    }

    console.log("Success!");
})