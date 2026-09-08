import React, { useState } from 'react';

export default function RoomModal({ isOpen, onClose, onCreateRoom, onJoinRoom }) {
  const [tab, setTab] = useState('create');
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  if (!isOpen) return null;

  const handleCreate = (e) => {
    e.preventDefault();
    if (roomName.trim()) {
      onCreateRoom(roomName);
      setRoomName('');
      onClose();
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomCode.trim()) {
      onJoinRoom(roomCode);
      setRoomCode('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content room-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-tabs">
          <button 
            className={`tab-btn ${tab === 'create' ? 'active' : ''}`} 
            onClick={() => setTab('create')}
          >
            สร้างห้องใหม่
          </button>
          <button 
            className={`tab-btn ${tab === 'join' ? 'active' : ''}`} 
            onClick={() => setTab('join')}
          >
            เข้าร่วมห้อง
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="modal-body">
            <h3>สร้างห้องแชท</h3>
            <label>ชื่อห้อง:</label>
            <input 
              type="text" 
              placeholder="..." 
              value={roomName} 
              onChange={(e) => setRoomName(e.target.value)} 
              required 
            />
            <button type="submit" className="btn-submit">สร้างห้อง</button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="modal-body">
            <h3>เข้าร่วมห้องด้วยรหัส</h3>
            <label>รหัสห้อง (Room Code):</label>
            <input 
              type="text" 
              placeholder="ระบุรหัส 6 หลัก เช่น 111111" 
              value={roomCode} 
              onChange={(e) => setRoomCode(e.target.value)} 
              required 
            />
            <button type="submit" className="btn-submit">เข้าร่วมห้อง</button>
          </form>
        )}

        <button className="btn-close-modal" onClick={onClose}>✖</button>
      </div>
    </div>
  );
}