const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

async function runImport() {
  try {
    console.log("กำลังเชื่อมต่อไปยัง Aiven...");
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      multipleStatements: true,
    });

    console.log("กำลังปิดข้อบังคับ Primary Key และเริ่มสร้างตาราง...");

    // ปิดข้อบังคับ Primary Key ชั่วคราวเฉพาะ Session นี้
    await connection.query("SET SESSION sql_require_primary_key = OFF;");

    const sqlPath = path.join(__dirname, "mysql.sql");
    const sqlScript = fs.readFileSync(sqlPath, "utf8");

    await connection.query(sqlScript);
    console.log("✅ สร้างฐานข้อมูลและตารางเรียบร้อยแล้ว!");
    await connection.end();
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาด:", err.message);
  }
}

runImport();
