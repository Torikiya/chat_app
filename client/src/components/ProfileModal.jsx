import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';

export default function ProfileModal({ user, onClose, onLogout, onProfileUpdated }) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);

  useEffect(() => {
    setUsername(user.username || '');
    setAvatarUrl(user.avatarUrl || '');
  }, [user]);

  // ฟังก์ชันก๊อปปี้ User ID
  const handleCopyId = () => {
    navigator.clipboard.writeText(user.userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพ');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('รูปโปรไฟล์ต้องมีขนาดไม่เกิน 2 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(String(reader.result));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const nextUsername = username.trim();
    if (!nextUsername) {
      setError('กรุณาระบุชื่อผู้ใช้');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/users/${user.userId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername, avatarUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ไม่สามารถแก้ไขโปรไฟล์ได้');

      onProfileUpdated?.({ username: data.username, avatarUrl });
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="media-modal-overlay" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="media-modal-close" onClick={onClose}>&times;</button>
        
        <div className="profile-header">
          <div
            className={`profile-avatar ${avatarUrl ? 'profile-avatar-clickable' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              if (avatarUrl) setShowAvatarPreview(true);
            }}
            title={avatarUrl ? 'คลิกเพื่อดูรูปโปรไฟล์' : undefined}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="รูปโปรไฟล์" />
            ) : (
              user.username ? user.username.charAt(0).toUpperCase() : 'U'
            )}
          </div>
          <h3>{user.username}</h3>
        </div>

        <div className="profile-info-list">
          {isEditing && (
            <div className="profile-edit-form">
              <span className="profile-field-label">ชื่อผู้ใช้</span>
              <input
                id="profile-username"
                value={username}
                maxLength={50}
                onChange={(event) => setUsername(event.target.value)}
              />
              <span className="profile-file-label">รูปโปรไฟล์</span>
              <label className="file-button profile-file-button">
                แนบรูปโปรไฟล์
                <input id="profile-avatar" type="file" accept="image/*" onChange={handleAvatarChange} />
              </label>
            </div>
          )}

          <div className="info-item">
            <label>User ID</label>
            <div className="id-box">
              <span>{user.userId}</span>
              <button type="button" onClick={handleCopyId} className="btn-copy">
                {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
              </button>
            </div>
          </div>

          {error && <div className="profile-error">{error}</div>}
        </div>

        <div className="profile-actions">
          {isEditing ? (
            <>
              <button type="button" className="btn-copy" onClick={() => setIsEditing(false)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn-save-profile" onClick={handleSave} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
              </button>
            </>
          ) : (
            <button type="button" className="btn-edit-profile" onClick={() => setIsEditing(true)}>
              แก้ไขโปรไฟล์
            </button>
          )}
          <button type="button" className="btn-logout" onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </div>

      {showAvatarPreview && (
        <div className="media-modal-overlay profile-image-preview" onClick={() => setShowAvatarPreview(false)}>
          <div className="media-modal-content" onClick={(event) => event.stopPropagation()}>
            <button className="media-modal-close" onClick={() => setShowAvatarPreview(false)}>&times;</button>
            <img src={avatarUrl} alt="รูปโปรไฟล์ขนาดเต็ม" />
          </div>
        </div>
      )}
    </div>
  );
}