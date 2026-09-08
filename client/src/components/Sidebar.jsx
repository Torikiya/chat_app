import React from 'react';

export default function Sidebar({ 
  user = {}, 
  rooms = [], 
  currentRoom, 
  unreadRooms, 
  onSelectRoom, 
  onOpenRoomModal, 
  onOpenProfile 
}) {
  const displayName = user?.name || user?.username || 'ผู้ใช้';

  return (
    <div className="sidebar-left">
      <div className="sidebar-header">
        <div
          className="user-profile"
          onClick={onOpenProfile}
          onKeyDown={(event) => event.key === 'Enter' && onOpenProfile?.()}
          role="button"
          tabIndex={0}
          title="ดูโปรไฟล์"
        >
          <span className="user-avatar" aria-hidden="true">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </span>
          <strong className="user-name">{displayName}</strong>
        </div>
        <button className="btn-add-room" onClick={onOpenRoomModal} title="สร้าง หรือ เข้าร่วมห้อง">
          +
        </button>
      </div>

      <h3>ห้องแชทของคุณ</h3>
      <div className="room-list">
        {rooms.length === 0 ? (
          <p className="no-rooms">ยังไม่ได้เข้าร่วมห้องใดๆ กดปุ่ม + เพื่อเริ่มต้น</p>
        ) : (
          rooms.map((r) => (
            <div 
              key={r.room_id} 
              className={`room-item ${String(currentRoom?.room_id) === String(r.room_id) ? 'active' : ''} ${unreadRooms?.[r.room_id] ? 'unread' : ''}`}
              onClick={() => onSelectRoom(r)}
            >
              <div className="room-item-name"># {r.room_name}</div>
              {unreadRooms?.[r.room_id] && <span className="unread-indicator" aria-label="มีข้อความใหม่" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}