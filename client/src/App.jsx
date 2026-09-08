import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import UserLogin from './components/UserLogin';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MemberModal from './components/MemberModal';
import RoomModal from './components/roomModal';
import ProfileModal from './components/ProfileModal';
import { API_URL } from './config';
import './App.css';

const socket = io(API_URL, {
  transports: ['polling'],
  reconnection: true,
  reconnectionAttempts: 5,
});

export default function App() {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadRooms, setUnreadRooms] = useState({});
  const [openedUnreadMessageId, setOpenedUnreadMessageId] = useState(null);
  const [members, setMembers] = useState({ owner: null, onlineMembers: [], allMembers: [] });
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [notice, setNotice] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const currentRoomRef = React.useRef(null);
  const userRef = React.useRef(null);
  const socketErrorShownRef = React.useRef(false);
  const restoredRoomKeyRef = React.useRef(null);
  const skipUnreadPersistRef = React.useRef(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) {
      try {
        const savedUserData = JSON.parse(savedUser);
        setCurrentUser(savedUserData);
        setUser({ id: savedUserData.userId, name: savedUserData.username, avatarUrl: savedUserData.avatarUrl });
        socket.emit('login_user', {
          userId: savedUserData.userId,
          username: savedUserData.username,
        });
        fetchUserRooms(savedUserData.userId);
      } catch (e) {
        localStorage.removeItem('chat_user');
      }
    }
    setAuthReady(true);
  }, []);

  const handleLoginSuccess = (userData) => {
    currentRoomRef.current = null;
    restoredRoomKeyRef.current = null;
    setRooms([]);
    setMessages([]);
    setCurrentRoom(null);
    setUnreadRooms({});
    setOpenedUnreadMessageId(null);
    setCurrentUser(userData);
    setUser({ id: userData.userId, name: userData.username, avatarUrl: userData.avatarUrl });
    socket.emit('login_user', { userId: userData.userId, username: userData.username });
    fetchUserRooms(userData.userId);
  };

  const handleProfileUpdated = ({ username, avatarUrl }) => {
    const nextUser = { ...currentUser, username, avatarUrl };
    localStorage.setItem('chat_user', JSON.stringify(nextUser));
    setCurrentUser(nextUser);
    setUser((previousUser) => ({ ...previousUser, name: username, avatarUrl }));
    socket.emit('login_user', { userId: nextUser.userId, username });
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    localStorage.removeItem('chat_token');
    setCurrentUser(null);
    setUser(null);
    setRooms([]);
    setCurrentRoom(null);
    setMessages([]);
    setUnreadRooms({});
    setOpenedUnreadMessageId(null);
    currentRoomRef.current = null;
    restoredRoomKeyRef.current = null;
    setShowProfile(false);
  }

  useEffect(() => {
    currentRoomRef.current = currentRoom;
    userRef.current = user;
  }, [currentRoom, user]);

  useEffect(() => {
    if (!user) return;
    const storageKey = `chat-unread-rooms-${user.id}`;
    let savedUnreadRooms = {};
    try {
      savedUnreadRooms = JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      savedUnreadRooms = {};
    }
    skipUnreadPersistRef.current = true;
    setUnreadRooms(savedUnreadRooms);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (skipUnreadPersistRef.current) {
      skipUnreadPersistRef.current = false;
      return;
    }
    localStorage.setItem(`chat-unread-rooms-${user.id}`, JSON.stringify(unreadRooms));
  }, [unreadRooms, user]);

  const showNotice = (message, onConfirm = null) => {
    setNotice({ message, onConfirm });
  };

  const closeNotice = () => setNotice(null);

  const confirmNotice = () => {
    const action = notice?.onConfirm;
    closeNotice();
    if (action) action();
  };

  const sortRoomsByLatest = (availableRooms) => {
    return [...availableRooms].sort((firstRoom, secondRoom) => {
      const firstTime = firstRoom.last_message_at ? Date.parse(firstRoom.last_message_at) : 0;
      const secondTime = secondRoom.last_message_at ? Date.parse(secondRoom.last_message_at) : 0;

      if (firstTime !== secondTime) return secondTime - firstTime;
      return Number(secondRoom.room_id) - Number(firstRoom.room_id);
    });
  };

  const fetchUserRooms = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/api/users/${userId}/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error("fetchUserRooms error:", err);
    }
  };

  const handleUserSubmit = async (userId, username) => {
    const nextUser = { id: String(userId), name: username };
    setUser(nextUser);
    socket.emit('login_user', { userId: nextUser.id, username });
    await fetchUserRooms(nextUser.id);
  };

  const handleCreateRoom = (roomName) => {
    if (!user) return;
    socket.emit('create_room', { roomName, userId: user.id }, async (res) => {
      if (res && res.success) {
        await fetchUserRooms(user.id);
        joinRoom(res.room);
      } else {
        showNotice('เกิดข้อผิดพลาด: ' + (res?.message || res?.error || 'ไม่ทราบสาเหตุ'));
      }
    });
  };

  const handleJoinRoomByCode = (roomCode) => {
    socket.emit('join_room_by_code', { roomCode, userId: user.id }, (res) => {
      if (res.success) {
        fetchUserRooms(user.id);
        joinRoom(res.room);
      } else {
        showNotice(res.message);
      }
    });
  };

  const clearUnreadRoom = (roomId) => {
    setUnreadRooms((prev) => {
      if (!prev[roomId]) return prev;
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  };

  const joinRoom = (room, activeUser = user) => {
    if (!room || !activeUser) return;
    const activeRoomId = currentRoomRef.current?.room_id ?? currentRoom?.room_id;
    if (String(activeRoomId) === String(room.room_id)) return;

    localStorage.setItem(`chat-last-room-${activeUser.id}`, String(room.room_id));
    setOpenedUnreadMessageId(unreadRooms[room.room_id] || null);
    clearUnreadRoom(room.room_id);
    currentRoomRef.current = room;
    setCurrentRoom(room);
    setMessages([]);
    setMembers({ owner: null, onlineMembers: [], allMembers: [] });
    socket.emit('join_room', { 
      roomId: room.room_id, 
      userId: activeUser.id, 
      username: activeUser.name 
    });
  };

  useEffect(() => {
    if (!user || rooms.length === 0 || currentRoom) return;

    const storageKey = `chat-last-room-${user.id}`;
    if (restoredRoomKeyRef.current === storageKey) return;
    restoredRoomKeyRef.current = storageKey;

    const savedRoomId = localStorage.getItem(storageKey);
    if (!savedRoomId) return;

    const savedRoom = rooms.find((room) => String(room.room_id) === savedRoomId);
    if (savedRoom) joinRoom(savedRoom, user);
  }, [user, rooms, currentRoom]);

  const handleKickUser = (_targetSocketId, targetUserId) => {
    if (!currentRoom || !user) return;
    socket.emit("kick_user", {
      roomId: currentRoom.room_id,
      targetUserId,
    }, (res) => {
      if (!res?.success) showNotice(res?.message || 'ไม่สามารถเตะสมาชิกได้');
    });
  };

  const handleRenameRoom = (roomId, newName) => {
    if (!user) return;
    socket.emit("rename_room", { roomId, newName, userId: user.id });
  };

  const handleDeleteRoom = (roomId) => {
    if (!user) return;
    socket.emit("delete_room", { roomId }, (res) => {
      if (!res?.success) showNotice(res?.message || 'ไม่สามารถยุบห้องได้');
    });
  };

  useEffect(() => {
    socket.on('load_messages', (msgs) => {
      setMessages(msgs);
    });

    socket.on('connect', () => {
      socketErrorShownRef.current = false;
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (!socketErrorShownRef.current) {
        socketErrorShownRef.current = true;
        showNotice('เชื่อมต่อระบบแชตไม่ได้ กรุณาลองรีเฟรชหน้าเว็บ');
      }
    });

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('room_activity', ({ roomId, lastMessageAt, messageId, senderSocketId }) => {
      setRooms((prev) => sortRoomsByLatest(prev.map((room) => (
        Number(room.room_id) === Number(roomId)
          ? { ...room, last_message_at: lastMessageAt }
          : room
      ))));

      if (socket.id !== senderSocketId && Number(currentRoomRef.current?.room_id) !== Number(roomId)) {
        setUnreadRooms((prev) => ({ ...prev, [roomId]: prev[roomId] || messageId || true }));
      }
    });

    socket.on('message_deleted', ({ messageId, messageText, messageType }) => {
      setMessages((prev) => prev.map((message) => (
        Number(message.message_id ?? message.id) === Number(messageId)
          ? { ...message, message_text: messageText, message_type: messageType || 'deleted', file_url: null, file_name: null, mime_type: null }
          : message
      )));
    });

    socket.on('message_edited', ({ messageId, messageText, editedAt }) => {
      setMessages((prev) => prev.map((message) => (
        Number(message.message_id ?? message.id) === Number(messageId)
          ? { ...message, message_text: messageText, edited: true, edited_at: editedAt }
          : message
      )));
    });

    socket.on('update_members', (data) => {
      console.log("สมาชิกอัปเดต:", data);
      setMembers(data);
    });

    socket.on('kicked', () => {
      showNotice('คุณถูกเตะออกจากห้อง');
      setCurrentRoom(null);
      setMembers({ owner: null, onlineMembers: [], allMembers: [] });
      setShowMemberModal(false);
    });

    socket.on("room_renamed", ({ roomId, newName }) => {
      setRooms((prev) =>
        prev.map((r) => (Number(r.room_id) === Number(roomId) ? { ...r, room_name: newName } : r))
      );
      setCurrentRoom((prev) => {
        if (prev && Number(prev.room_id) === Number(roomId)) {
          return { ...prev, room_name: newName };
        }
        return prev;
      });
    });

    socket.on("room_deleted", ({ roomId }) => {
      setRooms((prev) => prev.filter((r) => Number(r.room_id) !== Number(roomId)));
      setCurrentRoom((prev) => {
        if (prev && Number(prev.room_id) === Number(roomId)) {
          setShowMemberModal(false);
          showNotice("ห้องแชทนี้ถูกยุบโดยเจ้าของห้องแล้ว");
          return null;
        }
        return prev;
      });
    });

    return () => {
      socket.off('load_messages');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('receive_message');
      socket.off('room_activity');
      socket.off('message_deleted');
      socket.off('message_edited');
      socket.off('update_members');
      socket.off('kicked');
      socket.off("room_renamed");
      socket.off("room_deleted");
    };
  }, []);

  if (!authReady) return null;
  if (!currentUser || !user) return <UserLogin onLoginSuccess={handleLoginSuccess} />;

  return (
    <div className="app-container">
      <Sidebar 
        user={user} 
        rooms={rooms} 
        currentRoom={currentRoom} 
        unreadRooms={unreadRooms}
        onSelectRoom={joinRoom} 
        onOpenRoomModal={() => setShowRoomModal(true)} 
        onOpenProfile={() => setShowProfile(true)}
      />

      <ChatArea 
        currentRoom={currentRoom} 
        messages={messages} 
        user={user} 
        initialUnreadMessageId={openedUnreadMessageId}
        onUnreadChange={(hasUnread) => {
          if (!currentRoom) return;
          if (!hasUnread) setOpenedUnreadMessageId(null);
          setUnreadRooms((prev) => {
            if (hasUnread) return { ...prev, [currentRoom.room_id]: true };
            if (!prev[currentRoom.room_id]) return prev;
            const next = { ...prev };
            delete next[currentRoom.room_id];
            return next;
          });
        }}
        onHeaderClick={() => setShowMemberModal(true)}
        onSendMessage={(text) => socket.emit('send_message', {
          roomId: currentRoom.room_id,
          userId: user.id,
          message: text,
          messageType: 'text',
        }, (res) => {
          if (!res?.success) showNotice(res?.message || 'ส่งข้อความไม่สำเร็จ');
        })}
        onDeleteMessage={(messageId) => {
          if (!messageId) {
            showNotice('ข้อความนี้ไม่มีรหัสอ้างอิง จึงยังลบไม่ได้ กรุณารีเฟรชห้องแชต');
            return;
          }
          const roomId = currentRoom.room_id;
          showNotice('คุณต้องการลบข้อความนี้ใช่หรือไม่?', () => {
            socket.emit('delete_message', {
              roomId,
              messageId,
            }, (res) => {
              if (!res?.success) showNotice(res?.message || 'ไม่สามารถลบข้อความได้');
            });
          });
        }}
        onEditMessage={(messageId, messageText) => socket.emit('edit_message', {
          roomId: currentRoom.room_id,
          messageId,
          messageText,
        })}
        onSendAttachment={async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('roomId', currentRoom.room_id);
          formData.append('userId', user.id);

          const response = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });
          const responseText = await response.text();
          let attachment;
          try {
            attachment = JSON.parse(responseText);
          } catch {
            throw new Error(`เซิร์ฟเวอร์ไม่ตอบ JSON (HTTP ${response.status}) กรุณารีสตาร์ต server`);
          }
          if (!response.ok) throw new Error(attachment.error || 'อัปโหลดไฟล์ไม่สำเร็จ');

          socket.emit('send_message', {
            roomId: currentRoom.room_id,
            userId: user.id,
            messageType: attachment.type,
            fileUrl: attachment.url,
            fileName: attachment.name,
            mimeType: attachment.mimeType,
          });
        }}
      />

      <RoomModal 
        isOpen={showRoomModal} 
        onClose={() => setShowRoomModal(false)} 
        onCreateRoom={handleCreateRoom} 
        onJoinRoom={handleJoinRoomByCode} 
      />

      {showMemberModal && (
        <MemberModal
          members={members}
          currentUserId={user.id}
          currentRoom={currentRoom}
          onClose={() => setShowMemberModal(false)}
          onKick={handleKickUser}
          onConfirm={showNotice}
          onRenameRoom={handleRenameRoom}
          onDeleteRoom={handleDeleteRoom}
        />
      )}

      {showProfile && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfile(false)}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />
      )}

      {notice && (
        <NoticeModal
          message={notice.message}
          isConfirm={Boolean(notice.onConfirm)}
          onClose={closeNotice}
          onConfirm={confirmNotice}
        />
      )}
    </div>
  );
}

function NoticeModal({ message, isConfirm, onClose, onConfirm }) {
  return (
    <div className="modal-overlay notice-overlay" onClick={onClose}>
      <div className="modal-content notice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="notice-icon">!</div>
        <h3>{isConfirm ? 'ยืนยันการดำเนินการ' : 'แจ้งเตือน'}</h3>
        <p>{message}</p>
        <div className="notice-actions">
          {isConfirm && (
            <button className="notice-btn notice-btn-cancel" onClick={onClose}>
              ยกเลิก
            </button>
          )}
          <button
            className={`notice-btn ${isConfirm ? 'notice-btn-danger' : 'notice-btn-primary'}`}
            onClick={isConfirm ? onConfirm : onClose}
          >
            {isConfirm ? 'ยืนยัน' : 'ตกลง'}
          </button>
        </div>
      </div>
    </div>
  );
}