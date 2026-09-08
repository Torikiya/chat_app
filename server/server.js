const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
  origin: CLIENT_URL,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
}));

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

app.use(express.json({ limit: "5mb" }));

const uploadDirectory = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });
app.use("/uploads", express.static(uploadDirectory));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      callback(
        null,
        `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
      );
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed =
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/") ||
      file.mimetype.startsWith("application/") ||
      file.mimetype.startsWith("text/");
    callback(allowed ? null : new Error("ชนิดไฟล์นี้ยังไม่รองรับ"), allowed);
  },
});

const JWT_SECRET = process.env.JWT_SECRET || "local-development-secret";
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "151620088124-43c1jun4qucrru3is8246pjrip0mtnqc.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function generateRandomUserId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let randomStr = "";
  for (let i = 0; i < 8; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `usr_${randomStr}`;
}

async function cacheGoogleAvatar(pictureUrl) {
  if (!pictureUrl) return null;

  try {
    const response = await fetch(pictureUrl, {
      headers: { "User-Agent": "chat-app-avatar/1.0" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/")) return pictureUrl;

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (imageBuffer.length > 2 * 1024 * 1024) return pictureUrl;
    return `data:${contentType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.warn("Google avatar download failed:", error.message);
    return pictureUrl;
  }
}

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "chat_app",
});

async function ensureProfileColumn() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN avatar_url LONGTEXT NULL");
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
}

async function getMessageIdColumn() {
  const [columns] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages'
       AND COLUMN_NAME IN ('message_id', 'id')
     ORDER BY FIELD(COLUMN_NAME, 'message_id', 'id')
     LIMIT 1`,
  );
  return columns[0]?.COLUMN_NAME || "message_id";
}

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    const [existing] = await db.query(
      "SELECT user_id FROM users WHERE email = ?",
      [email],
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "อีเมลนี้ถูกใช้งานในระบบแล้ว" });
    }

    const userId = generateRandomUserId();
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (user_id, username, email, password, provider) VALUES (?, ?, ?, ?, 'email')",
      [userId, username, email, hashedPassword],
    );

    const token = jwt.sign({ userId, username, email }, JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({
      success: true,
      user: { userId, username, email, provider: "email", avatarUrl: null },
      token,
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสมัครสมาชิก" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "กรุณากรอกอีเมลและรหัสผ่าน" });
  }

  try {
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length === 0) {
      return res.status(400).json({ error: "ไม่พบผู้ใช้นี้ในระบบ" });
    }

    const user = users[0];
    if (user.provider === "email" && user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });
      }
    }

    const token = jwt.sign(
      { userId: user.user_id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        provider: user.provider,
        avatarUrl: user.avatar_url || null,
      },
      token,
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

app.post("/api/auth/social", async (req, res) => {
  const { email, username, provider } = req.body;
  if (!email || !username) {
    return res.status(400).json({ error: "ข้อมูลจากระบบโซเชียลไม่ครบถ้วน" });
  }

  try {
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    let user;

    if (existing.length > 0) {
      user = existing[0];
    } else {
      const userId = generateRandomUserId();
      await db.query(
        "INSERT INTO users (user_id, username, email, provider) VALUES (?, ?, ?, ?)",
        [userId, username, email, provider || "google"],
      );
      user = { user_id: userId, username, email, provider };
    }

    const token = jwt.sign(
      { userId: user.user_id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        provider: user.provider,
        avatarUrl: user.avatar_url || null,
      },
      token,
    });
  } catch (err) {
    console.error("social login error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการเชื่อมต่อบัญชีโซเชียล" });
  }
});

app.post("/api/auth/google", async (req, res) => {
  const { token } = req.body;
  if (!token || !GOOGLE_CLIENT_ID) {
    return res.status(400).json({ error: "ระบบ Google Login ยังไม่ได้ตั้งค่า" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.error("Google token verification error:", error.message);
    return res.status(401).json({ error: "Google token ไม่ถูกต้องหรือ Client ID ไม่ตรงกัน" });
  }

  const email = payload?.email;
  if (!email) return res.status(400).json({ error: "Google ไม่ส่งอีเมลของผู้ใช้มา" });
  const username = payload.name || email.split("@")[0];

  try {
    const avatarUrl = await cacheGoogleAvatar(payload.picture);
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    let user = existing[0];

    if (!user) {
      const userId = generateRandomUserId();
      await db.query(
        "INSERT INTO users (user_id, username, email, provider, avatar_url) VALUES (?, ?, ?, 'google', ?)",
        [userId, username, email, avatarUrl],
      );
      user = { user_id: userId, username, email, provider: "google", avatar_url: avatarUrl };
    } else if (avatarUrl && user.avatar_url !== avatarUrl) {
      await db.query(
        "UPDATE users SET avatar_url = ? WHERE user_id = ?",
        [avatarUrl, user.user_id],
      );
      user.avatar_url = avatarUrl;
    }

    const appToken = jwt.sign(
      { userId: user.user_id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        provider: "google",
        avatarUrl: user.avatar_url || avatarUrl || null,
      },
      token: appToken,
    });
  } catch (error) {
    console.error("Google account persistence error:", error);
    res.status(500).json({ error: "Google ผ่านการยืนยันแล้ว แต่บันทึกบัญชีในระบบไม่ได้" });
  }
});

app.patch("/api/users/:userId/profile", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";
  const avatarUrl =
    typeof req.body.avatarUrl === "string" ? req.body.avatarUrl : null;

  if (!userId || !username) {
    return res.status(400).json({ error: "กรุณาระบุชื่อผู้ใช้" });
  }
  if (username.length > 50) {
    return res.status(400).json({ error: "ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร" });
  }

  try {
    const [result] = await db.query(
      "UPDATE users SET username = ?, avatar_url = ? WHERE user_id = ?",
      [username, avatarUrl, userId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้คนนี้" });
    }
    res.json({ success: true, username, avatarUrl });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ error: "ไม่สามารถแก้ไขโปรไฟล์ได้" });
  }
});

app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, async (uploadError) => {
    if (uploadError)
      return res.status(400).json({ error: uploadError.message });

    const roomId = Number(req.body.roomId);
    const userId = String(req.body.userId || "").trim();
    const file = req.file;
    if (!file || !Number.isInteger(roomId) || !userId) {
      if (file) fs.unlinkSync(file.path);
      return res.status(400).json({ error: "ข้อมูลไฟล์ไม่ถูกต้อง" });
    }

    try {
      const [members] = await db.query(
        `SELECT r.room_id FROM rooms r
         LEFT JOIN room_members rm ON r.room_id = rm.room_id
         WHERE r.room_id = ? AND (r.owner_id = ? OR rm.user_id = ?)
         LIMIT 1`,
        [roomId, userId, userId],
      );
      if (members.length === 0) {
        fs.unlinkSync(file.path);
        return res
          .status(403)
          .json({ error: "คุณไม่มีสิทธิ์ส่งไฟล์ในห้องนี้" });
      }

      const maxSize = file.mimetype.startsWith("video/") ? 100 : 10;
      if (file.size > maxSize * 1024 * 1024) {
        fs.unlinkSync(file.path);
        return res
          .status(413)
          .json({ error: `ไฟล์ประเภทนี้ต้องมีขนาดไม่เกิน ${maxSize} MB` });
      }

      res.json({
        type: file.mimetype.startsWith("image/")
          ? "image"
          : file.mimetype.startsWith("video/")
            ? "video"
            : "file",
        url: `/uploads/${file.filename}`,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      console.error("upload error:", error);
      res.status(500).json({ error: "อัปโหลดไฟล์ไม่สำเร็จ" });
    }
  });
});

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get("/api/users/:userId/rooms", async (req, res) => {
  const { userId } = req.params;
  try {
    const [rooms] = await db.query(
      `SELECT DISTINCT r.room_id, r.room_code, r.room_name, r.owner_id,
              latest.created_at AS last_message_at
       FROM rooms r
       LEFT JOIN room_members rm ON r.room_id = rm.room_id
       LEFT JOIN (
         SELECT room_id, MAX(created_at) AS created_at
         FROM messages
         GROUP BY room_id
       ) latest ON latest.room_id = r.room_id
       WHERE r.owner_id = ? OR rm.user_id = ?
       ORDER BY latest.created_at DESC, r.room_id DESC`,
      [userId, userId],
    );
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const connectedSockets = {};

async function notifyRoomActivity(
  roomId,
  lastMessageAt,
  messageId,
  senderSocketId,
) {
  const [memberRows] = await db.query(
    "SELECT user_id FROM room_members WHERE room_id = ?",
    [roomId],
  );
  const memberIds = new Set(memberRows.map((member) => String(member.user_id)));

  for (const connectedSocket of io.sockets.sockets.values()) {
    if (memberIds.has(String(connectedSocket.userId))) {
      connectedSocket.emit("room_activity", {
        roomId,
        lastMessageAt,
        messageId,
        senderSocketId,
      });
    }
  }
}

io.on("connection", (socket) => {
  socket.on("login_user", async ({ userId, username }) => {
    socket.userId = String(userId);
    socket.username = username;
    await db.query(
      `INSERT INTO users (user_id, username) VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE username = ?`,
      [String(userId), username, username],
    );
  });

  socket.on("create_room", async ({ roomName, userId }, callback) => {
    try {
      const roomCode = generateRoomCode();
      const [result] = await db.query(
        "INSERT INTO rooms (room_code, room_name, owner_id) VALUES (?, ?, ?)",
        [roomCode, roomName, String(userId)],
      );
      const roomId = result.insertId;
      await db.query(
        "INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)",
        [roomId, String(userId)],
      );

      const newRoom = {
        room_id: roomId,
        room_code: roomCode,
        room_name: roomName,
        owner_id: String(userId),
      };
      if (callback) callback({ success: true, room: newRoom });
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  socket.on("join_room_by_code", async ({ roomCode, userId }, callback) => {
    try {
      const [rooms] = await db.query(
        "SELECT * FROM rooms WHERE room_code = ?",
        [roomCode],
      );
      if (rooms.length === 0) {
        return callback({
          success: false,
          message: "ไม่พบห้องแชทรหัสนี้ในระบบ",
        });
      }

      const room = rooms[0];
      await db.query(
        "INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)",
        [room.room_id, String(userId)],
      );

      if (callback) callback({ success: true, room });
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  socket.on("join_room", async ({ roomId, userId, username }) => {
    const numericRoomId = Number(roomId);
    const rid = String(numericRoomId);
    const uid = String(userId);

    if (socket.roomId) {
      socket.leave(socket.roomId);
      const oldRoom = socket.roomId;
      socket.roomId = null;
      delete connectedSockets[socket.id];
      await sendUpdatedMemberList(oldRoom);
    }

    socket.join(rid);
    socket.roomId = rid;
    socket.userId = uid;
    socket.username = username;

    connectedSockets[socket.id] = {
      socketId: socket.id,
      roomId: rid,
      userId: uid,
      username: username,
    };

    await db.query(
      "INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)",
      [numericRoomId, uid],
    );

    const messageIdColumn = await getMessageIdColumn();
    const [messages] = await db.query(
      `SELECT m.${messageIdColumn} AS message_id, m.message_text, m.message_type,
              m.file_url, m.file_name, m.mime_type, m.edited_at, m.user_id, u.username, 
              DATE_FORMAT(m.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at 
       FROM messages m 
       JOIN users u ON m.user_id = u.user_id 
       WHERE CAST(m.room_id AS CHAR) = ? 
       ORDER BY m.created_at ASC LIMIT 50`,
      [String(numericRoomId)],
    );

    socket.emit("load_messages", messages);
    await sendUpdatedMemberList(rid);
  });

  socket.on(
    "send_message",
    async ({
      roomId,
      userId,
      message,
      messageType,
      fileUrl,
      fileName,
      mimeType,
    }) => {
      try {
        const numericRoomId = Number(roomId);
        const rid = String(numericRoomId);
        const uid = String(userId);
        const normalizedType = messageType || "text";
        const text = normalizedType === "text" ? message || "" : "";

        const [result] = await db.query(
          `INSERT INTO messages
         (room_id, user_id, message_text, message_type, file_url, file_name, mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            numericRoomId,
            uid,
            text,
            normalizedType,
            fileUrl || null,
            fileName || null,
            mimeType || null,
          ],
        );

        io.to(rid).emit("receive_message", {
          message_id: result.insertId,
          user_id: uid,
          username: socket.username || "ผู้ใช้",
          message_text: message,
          message_type: normalizedType,
          file_url: fileUrl || null,
          file_name: fileName || null,
          mime_type: mimeType || null,
          created_at: new Date(),
        });
        await notifyRoomActivity(
          numericRoomId,
          new Date(),
          result.insertId,
          socket.id,
        );
      } catch (err) {
        console.error("send_message error:", err);
      }
    },
  );

  socket.on("delete_message", async ({ roomId, messageId }, callback) => {
    try {
      const numericRoomId = Number(roomId);
      const messageIdColumn = await getMessageIdColumn();
      const [rows] = await db.query(
        `SELECT m.user_id, r.owner_id FROM messages m
         JOIN rooms r ON r.room_id = m.room_id
         WHERE m.${messageIdColumn} = ? AND m.room_id = ?`,
        [messageId, numericRoomId],
      );

      if (rows.length === 0) {
        return callback?.({ success: false, message: "ไม่พบข้อความนี้" });
      }

      const currentUserId = String(socket.userId);
      const msgUserId = String(rows[0].user_id);
      const ownerId = String(rows[0].owner_id);

      if (msgUserId !== currentUserId && ownerId !== currentUserId) {
        return callback?.({
          success: false,
          message: "ไม่มีสิทธิ์ลบข้อความนี้",
        });
      }

      await db.query(
        `UPDATE messages
         SET message_text = '', message_type = 'deleted', file_url = NULL, file_name = NULL, mime_type = NULL
         WHERE ${messageIdColumn} = ? AND room_id = ?`,
        [messageId, numericRoomId],
      );
      io.to(String(numericRoomId)).emit("message_deleted", {
        messageId,
        messageText: null,
        messageType: "deleted",
      });
      callback?.({ success: true });
    } catch (err) {
      console.error("delete_message error:", err);
      callback?.({ success: false, message: "ไม่สามารถลบข้อความได้" });
    }
  });

  socket.on(
    "edit_message",
    async ({ roomId, messageId, messageText }, callback) => {
      try {
        const numericRoomId = Number(roomId);
        const nextText =
          typeof messageText === "string" ? messageText.trim() : "";
        const messageIdColumn = await getMessageIdColumn();

        if (!nextText)
          return callback?.({
            success: false,
            message: "ข้อความแก้ไขต้องไม่ว่าง",
          });

        const [rows] = await db.query(
          `SELECT user_id FROM messages WHERE ${messageIdColumn} = ? AND room_id = ? AND message_type = 'text'`,
          [messageId, numericRoomId],
        );
        if (rows.length === 0)
          return callback?.({ success: false, message: "ไม่พบข้อความนี้" });
        if (String(rows[0].user_id) !== String(socket.userId)) {
          return callback?.({
            success: false,
            message: "แก้ไขได้เฉพาะข้อความของตัวเอง",
          });
        }

        await db.query(
          `UPDATE messages SET message_text = ?, edited_at = NOW() WHERE ${messageIdColumn} = ? AND room_id = ?`,
          [nextText, messageId, numericRoomId],
        );
        const editedAt = new Date();
        io.to(String(numericRoomId)).emit("message_edited", {
          messageId,
          messageText: nextText,
          editedAt,
        });
        callback?.({ success: true });
      } catch (err) {
        console.error("edit_message error:", err);
        callback?.({ success: false, message: "ไม่สามารถแก้ไขข้อความได้" });
      }
    },
  );

  socket.on("kick_user", async ({ roomId, targetUserId }, callback) => {
    try {
      const numericRoomId = Number(roomId);
      const targetUid = String(targetUserId || "").trim();
      const rid = String(numericRoomId);

      if (isNaN(numericRoomId) || !targetUid) {
        return callback?.({
          success: false,
          message: "ข้อมูลสมาชิกไม่ถูกต้อง",
        });
      }

      const [roomData] = await db.query(
        "SELECT owner_id FROM rooms WHERE room_id = ?",
        [numericRoomId],
      );

      const ownerId = String(roomData[0]?.owner_id);
      const currentUserId = String(socket.userId);

      if (ownerId !== currentUserId || targetUid === currentUserId) {
        return callback?.({ success: false, message: "ไม่มีสิทธิ์เตะสมาชิก" });
      }

      await db.query(
        "DELETE FROM room_members WHERE room_id = ? AND user_id = ?",
        [numericRoomId, targetUid],
      );

      const roomSockets = await io.in(rid).fetchSockets();
      roomSockets
        .filter((targetSocket) => String(targetSocket.userId) === targetUid)
        .forEach((targetSocket) => {
          targetSocket.roomId = null;
          targetSocket.leave(rid);
          targetSocket.emit("kicked");
          delete connectedSockets[targetSocket.id];
        });

      await sendUpdatedMemberList(rid);
      callback?.({ success: true });
    } catch (err) {
      console.error("kick_user error:", err);
      callback?.({ success: false, message: "ไม่สามารถเตะสมาชิกได้" });
    }
  });

  socket.on("rename_room", async ({ roomId, newName, userId }) => {
    try {
      const numericRoomId = Number(roomId);
      if (isNaN(numericRoomId)) return;

      const [roomData] = await db.query(
        "SELECT owner_id FROM rooms WHERE room_id = ?",
        [numericRoomId],
      );
      if (String(roomData[0]?.owner_id) === String(userId)) {
        await db.query("UPDATE rooms SET room_name = ? WHERE room_id = ?", [
          newName,
          numericRoomId,
        ]);
        io.to(String(numericRoomId)).emit("room_renamed", {
          roomId: numericRoomId,
          newName,
        });
      }
    } catch (err) {
      console.error("rename_room error:", err);
    }
  });

  socket.on("delete_room", async ({ roomId }, callback) => {
    const numericRoomId = Number(roomId);

    if (isNaN(numericRoomId)) {
      return callback?.({ success: false, message: "รหัสห้องไม่ถูกต้อง" });
    }

    const connection = await db.getConnection();
    let transactionStarted = false;

    try {
      const [roomData] = await connection.query(
        "SELECT owner_id FROM rooms WHERE room_id = ?",
        [numericRoomId],
      );

      if (roomData.length === 0) {
        return callback?.({ success: false, message: "ไม่พบห้องนี้" });
      }

      if (String(roomData[0].owner_id) !== String(socket.userId)) {
        return callback?.({ success: false, message: "ไม่มีสิทธิ์ยุบห้อง" });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      await connection.query(
        "DELETE FROM messages WHERE CAST(room_id AS CHAR) = ?",
        [String(numericRoomId)],
      );
      await connection.query("DELETE FROM room_members WHERE room_id = ?", [
        numericRoomId,
      ]);
      await connection.query("DELETE FROM rooms WHERE room_id = ?", [
        numericRoomId,
      ]);

      await connection.commit();

      const rid = String(numericRoomId);
      io.to(rid).emit("room_deleted", { roomId: numericRoomId });

      Object.keys(connectedSockets).forEach((sId) => {
        if (connectedSockets[sId].roomId === rid) {
          delete connectedSockets[sId];
        }
      });

      io.in(rid).socketsLeave(rid);
      callback?.({ success: true });
    } catch (err) {
      if (transactionStarted) await connection.rollback();
      console.error("delete_room error:", err);
      callback?.({ success: false, message: "ไม่สามารถยุบห้องได้" });
    } finally {
      connection.release();
    }
  });

  socket.on("disconnect", async () => {
    if (socket.roomId) {
      const rid = socket.roomId;
      delete connectedSockets[socket.id];
      await sendUpdatedMemberList(rid);
    }
  });

  async function sendUpdatedMemberList(roomId) {
    try {
      const numericRoomId = Number(roomId);
      const rid = String(numericRoomId);

      const [roomData] = await db.query(
        `SELECT r.owner_id, u.username, u.avatar_url AS avatarUrl FROM rooms r 
         LEFT JOIN users u ON r.owner_id = u.user_id 
         WHERE r.room_id = ?`,
        [numericRoomId],
      );

      const ownerId = roomData[0]?.owner_id
        ? String(roomData[0].owner_id)
        : null;
      const ownerName = roomData[0]?.username || "เจ้าของห้อง";
      const ownerAvatarUrl = roomData[0]?.avatarUrl || null;

      const usersInThisRoom = Object.values(connectedSockets).filter(
        (user) => user.roomId === rid,
      );

      const uniqueUsersMap = new Map();
      usersInThisRoom.forEach((u) => {
        if (!uniqueUsersMap.has(u.userId)) {
          uniqueUsersMap.set(u.userId, u);
        }
      });
      const uniqueUsers = Array.from(uniqueUsersMap.values());

      const [membersRows] = await db.query(
        `SELECT u.user_id AS userId, u.username, u.avatar_url AS avatarUrl FROM room_members rm JOIN users u ON rm.user_id = u.user_id WHERE rm.room_id = ?`,
        [numericRoomId],
      );

      const onlineUserIds = new Set(
        usersInThisRoom.map((u) => String(u.userId)),
      );
      const allMembers = membersRows.map((r) => ({
        userId: String(r.userId),
        username: r.username,
        avatarUrl: r.avatarUrl || null,
        online: onlineUserIds.has(String(r.userId)),
      }));

      io.to(rid).emit("update_members", {
        owner: { userId: ownerId, username: ownerName, avatarUrl: ownerAvatarUrl },
        onlineMembers: uniqueUsers,
        allMembers: allMembers,
      });
    } catch (err) {
      console.error("sendUpdatedMemberList error:", err);
    }
  }
});

const PORT = process.env.PORT || 4000;
ensureProfileColumn()
  .then(() =>
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`)),
  )
  .catch((error) => {
    console.error("database initialization error:", error);
    process.exit(1);
  });
