require("dotenv").config();

const PORT = Number(process.env.PORT || 4000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "chat_app";
const DB_SSL = process.env.DB_SSL === "true";
const JWT_SECRET = process.env.JWT_SECRET || "local-development-secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

module.exports = {
	PORT,
	CLIENT_URL,
	DB_HOST,
	DB_PORT,
	DB_USER,
	DB_PASSWORD,
	DB_NAME,
	DB_SSL,
	JWT_SECRET,
	GOOGLE_CLIENT_ID,
};
