import React, { useState } from 'react';

export default function MemberModal({
  members,
  currentUserId,
  onClose,
  onKick,
  onConfirm,
  currentRoom,
  onRenameRoom,
  onDeleteRoom
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [newRoomName, setNewRoomName] = useState(currentRoom?.room_name || '');
  const [selectedMember, setSelectedMember] = useState(null); // สำหรับเปิด Mini Profile
  const [copied, setCopied] = useState(false);
  const [showMemberAvatar, setShowMemberAvatar] = useState(false);

  const ownerId = members?.owner?.userId ?? currentRoom?.owner_id;
  const isOwner = String(currentUserId || '') === String(ownerId || '');

  const onlineMap = new Map();
  (members?.onlineMembers || []).forEach((m) => {
    if (m.userId !== undefined && m.userId !== null) {
      onlineMap.set(String(m.userId), m.socketId);
    }
  });

  const handleRename = () => {
    if (!newRoomName.trim()) return;
    if (onRenameRoom) onRenameRoom(currentRoom.room_id, newRoomName);
    setIsEditing(false);
  };

  const handleKick = (targetSocketId, targetUserId, username) => {
    if (onConfirm) {
      onConfirm(
        `คุณต้องการเตะ ${username} ออกจากห้องนี้ใช่หรือไม่?`,
        () => {
          onKick?.(targetSocketId, targetUserId);
          setSelectedMember(null);
        },
      );
    } else {
      onKick?.(targetSocketId, targetUserId);
      setSelectedMember(null);
    }
  };

  const handleCopyId = (userId) => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="side-overlay" onClick={onClose}>
      <aside className="member-side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', margin: '4px 0' }}>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid #a5d6a7', outline: 'none', minWidth: 0 }}
                />
                <button onClick={handleRename} style={{ padding: '6px 8px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em' }}>
                  บันทึก
                </button>
                <button onClick={() => setIsEditing(false)} style={{ padding: '6px 8px', background: '#757575', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em' }}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ margin: 0, color: '#1b5e20', fontSize: '1.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentRoom?.room_name || '---'}
                </h3>
                {isOwner && (
                  <button onClick={() => { setNewRoomName(currentRoom?.room_name || ''); setIsEditing(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: 0 }} title="เปลี่ยนชื่อห้อง">
                    ✏️
                  </button>
                )}
              </div>
            )}
            <div className="room-code">
              รหัสห้อง: {currentRoom?.room_code || currentRoom?.room_id || '---'}
            </div>
          </div>
          <button className="btn-close-x" onClick={onClose}>✖</button>
        </div>

        <div className="panel-body">
          <h4>สมาชิกทั้งหมด</h4>

          {/* เจ้าของห้อง */}
          {members?.owner && (() => {
            const ownerIdStr = String(members.owner.userId);
            const ownerOnline = onlineMap.has(ownerIdStr) || String(currentUserId) === ownerIdStr;

            return (
              <div 
                key={members.owner.userId} 
                className="member-item owner"
                onClick={() => setSelectedMember({ ...members.owner, isOwner: true, isOnline: ownerOnline, socketId: onlineMap.get(ownerIdStr) })}
                style={{ cursor: 'pointer' }}
              >
                <div className="member-info">
                  <span className={`status-dot ${ownerOnline ? 'online' : 'offline'}`} />
                  <span className="member-name">{members.owner.username}</span>
                </div>
                <span className="badge-owner">เจ้าของ</span>
              </div>
            );
          })()}

          {/* สมาชิกคนอื่นๆ */}
          {members?.allMembers
            ?.filter((m) => String(m.userId) !== String(ownerId))
            .map((m) => {
              const memberIdStr = String(m.userId);
              const targetSocketId = onlineMap.get(memberIdStr);
              const isOnline = Boolean(m.online || targetSocketId);

              return (
                <div 
                  key={m.userId} 
                  className="member-item"
                  onClick={() => setSelectedMember({ ...m, isOwner: false, isOnline, socketId: targetSocketId })}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="member-info">
                    <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                    <span className="member-name">{m.username}</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* ปุ่มยุบห้อง */}
        {isOwner && (
          <div className="panel-footer">
            <button
              className="btn-delete-room"
              onClick={() => {
                if (onConfirm) {
                  onConfirm('คุณต้องการยุบห้องนี้ใช่หรือไม่?', () => onDeleteRoom?.(currentRoom.room_id));
                } else if (onDeleteRoom) {
                  onDeleteRoom(currentRoom.room_id);
                }
              }}
            >
              ยุบห้องแชท
            </button>
          </div>
        )}
      </aside>

      {/* Discord-style Mini Profile Modal */}
      {selectedMember && (
        <div className="media-modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="profile-modal-card mini-profile" onClick={(e) => e.stopPropagation()}>
            <button className="media-modal-close" onClick={() => setSelectedMember(null)}>&times;</button>
            
            <div className="profile-header">
              <div
                className={`profile-avatar ${selectedMember.avatarUrl ? 'profile-avatar-clickable' : ''}`}
                onClick={() => selectedMember.avatarUrl && setShowMemberAvatar(true)}
                title={selectedMember.avatarUrl ? 'คลิกเพื่อดูรูปโปรไฟล์' : undefined}
              >
                {selectedMember.avatarUrl ? (
                  <img src={selectedMember.avatarUrl} alt="รูปโปรไฟล์" />
                ) : (
                  (selectedMember.username || 'U').charAt(0).toUpperCase()
                )}
                <span className={`status-dot-large ${selectedMember.isOnline ? 'online' : 'offline'}`} />
              </div>
              <h3>{selectedMember.username}</h3>
              <span className="user-role-badge">
                {selectedMember.isOwner ? ' เจ้าของห้อง' : 'สมาชิก'}
              </span>
            </div>

            <div className="profile-info-list">
              <div className="info-item">
                <label>User ID</label>
                <div className="id-box">
                  <span>{selectedMember.userId}</span>
                  <button type="button" onClick={() => handleCopyId(selectedMember.userId)} className="btn-copy">
                    {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                  </button>
                </div>
              </div>
            </div>

            <div className="profile-actions">
              {/* เจ้าของห้องสามารถเตะคนอื่นได้ (ยกเว้นเตะตัวเอง) */}
              {isOwner && String(selectedMember.userId) !== String(currentUserId) && (
                <button 
                  type="button" 
                  className="btn-logout"
                  style={{ background: '#d32f2f', color: '#fff' }}
                  onClick={() => handleKick(selectedMember.socketId || null, selectedMember.userId, selectedMember.username)}
                >
                  เตะออกจากห้อง
                </button>
              )}
            </div>
          </div>

          {showMemberAvatar && selectedMember.avatarUrl && (
            <div className="media-modal-overlay profile-image-preview" onClick={() => setShowMemberAvatar(false)}>
              <div className="media-modal-content" onClick={(event) => event.stopPropagation()}>
                <button className="media-modal-close" onClick={() => setShowMemberAvatar(false)}>&times;</button>
                <img src={selectedMember.avatarUrl} alt="รูปโปรไฟล์ขนาดเต็ม" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}