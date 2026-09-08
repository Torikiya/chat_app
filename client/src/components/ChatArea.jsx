import React from 'react';
import { API_URL } from '../config';

function formatDateDivider(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = today - targetDate;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays < 7) {
    return date.toLocaleDateString('th-TH', { weekday: 'long' });
  }

  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export default function ChatArea({ currentRoom, messages = [], user = {}, initialUnreadMessageId, onHeaderClick, onSendMessage, onSendAttachment, onDeleteMessage, onEditMessage, onUnreadChange }) {
  const [replyText, setReplyText] = React.useState('');
  const messagesRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);
  const unreadDividerRef = React.useRef(null);
  const [unreadMessageId, setUnreadMessageId] = React.useState(null);
  const restoredRoomRef = React.useRef(null);
  const [editingMessage, setEditingMessage] = React.useState(null);
  const [previewMedia, setPreviewMedia] = React.useState(null);
  const isFirstLoadRef = React.useRef(true);

  const currentUserId = String(user?.id || '');

  const scrollToBottom = (behavior = 'auto') => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: behavior
      });
    }
  };

  React.useEffect(() => {
    setUnreadMessageId(initialUnreadMessageId || null);
    restoredRoomRef.current = null;
    isFirstLoadRef.current = true;
  }, [currentRoom?.room_id, initialUnreadMessageId]);

  React.useLayoutEffect(() => {
    if (!currentRoom?.room_id || messages.length === 0 || restoredRoomRef.current === currentRoom.room_id) return;

    if (messagesRef.current) {
      if (initialUnreadMessageId && unreadDividerRef.current) {
        unreadDividerRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    }

    restoredRoomRef.current = currentRoom.room_id;

    const timer = setTimeout(() => {
      isFirstLoadRef.current = false;
    }, 100);

    return () => clearTimeout(timer);
  }, [currentRoom?.room_id, messages.length, initialUnreadMessageId]);

  React.useEffect(() => {
    if (isFirstLoadRef.current || messages.length === 0) return;

    const container = messagesRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const lastMessage = messages[messages.length - 1];
    const isMyMessage = String(lastMessage?.user_id) === currentUserId || lastMessage?.username === user?.name;

    if (isMyMessage || isNearBottom) {
      scrollToBottom('smooth');
    }
  }, [messages, user, currentUserId]);

  const clearUnreadMessages = () => {
    setUnreadMessageId(null);
    onUnreadChange?.(false);
    scrollToBottom('smooth');
  };

  const saveEditedMessage = () => {
    const nextText = editingMessage?.text.trim();
    if (!nextText) return;
    onEditMessage?.(editingMessage.id, nextText);
    setEditingMessage(null);
  };

  if (!currentRoom) {
    return (
      <div className="chat-main">
        <div className="empty-state">
          กรุณาเลือกห้องแชทจากรายการด้านซ้าย หรือสร้างห้องใหม่เพื่อเริ่มแชท
        </div>
      </div>
    );
  }

  const firstOtherMessageIndex = messages.findIndex(
    (message) => String(message.user_id) !== currentUserId,
  );
  const unreadMessageIsLoaded = messages.some(
    (message) => String(message.message_id ?? message.id) === String(unreadMessageId),
  );

  return (
    <div className="chat-main">
      <div className="chat-header" onClick={onHeaderClick}>
        <span><strong>{currentRoom.room_name}</strong></span>
      </div>

      <div ref={messagesRef} className="chat-messages">
        {messages.map((m, idx) => {
          const currentDateStr = m.created_at ? new Date(m.created_at).toDateString() : null;
          const prevMessage = idx > 0 ? messages[idx - 1] : null;
          const prevDateStr = prevMessage?.created_at ? new Date(prevMessage.created_at).toDateString() : null;
          const showDateDivider = currentDateStr && currentDateStr !== prevDateStr;

          const isMyMsg = String(m.user_id) === currentUserId || m.username === user?.name;
          const roomOwnerId = String(currentRoom.owner_id || '');
          const canDelete = isMyMsg || roomOwnerId === currentUserId;
          const canEdit = isMyMsg && (!m.message_type || m.message_type === 'text');

          return (
            <React.Fragment key={m.message_id ?? m.id ?? idx}>
              {showDateDivider && (
                <div className="chat-date-divider">
                  <span>{formatDateDivider(m.created_at)}</span>
                </div>
              )}

              {(String(m.message_id ?? m.id) === String(unreadMessageId || initialUnreadMessageId)
                || ((unreadMessageId || initialUnreadMessageId) && !unreadMessageIsLoaded
                  && String(m.user_id) !== currentUserId
                  && idx === firstOtherMessageIndex)) && (
                <button ref={unreadDividerRef} className="unread-divider" onClick={clearUnreadMessages}>
                  <span>ข้อความที่ยังไม่ได้อ่าน</span>
                </button>
              )}

              <div className={`msg ${isMyMsg ? 'my-msg' : 'other-msg'}`}>
                <div className="sender">{m.username}</div>
                <MessageContent 
                  message={m} 
                  isOwnMessage={isMyMsg} 
                  onMediaClick={(url, type) => setPreviewMedia({ url, type })}
                />
                <div className="message-meta">
                  {(m.edited || m.is_edited || m.edited_at) && <span className="edited-label">แก้ไขแล้ว</span>}
                  <time className="message-time">{formatMessageTime(m.created_at)}</time>
                </div>
                <MessageActions
                  message={m.message_text || m.message || m.file_name || ''}
                  messageType={m.message_type}
                  canDelete={canDelete}
                  canEdit={canEdit}
                  onReply={() => setReplyText(`@${m.username} `)}
                  onEdit={() => setEditingMessage({
                    id: m.message_id ?? m.id,
                    text: m.message_text || m.message || '',
                  })}
                  onDelete={() => onDeleteMessage?.(m.message_id ?? m.id)}
                />
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} className="chat-scroll-anchor" aria-hidden="true" />
      </div>

      <MessageInput onSend={onSendMessage} onSendAttachment={onSendAttachment} replyText={replyText} onReplyChange={setReplyText} />

      {/* Modal แก้ไขข้อความ */}
      {editingMessage && (
        <div className="modal-overlay" onClick={() => setEditingMessage(null)}>
          <div className="modal-content edit-message-modal" onClick={(event) => event.stopPropagation()}>
            <h3>แก้ไขข้อความ</h3>
            <textarea
              value={editingMessage.text}
              onChange={(event) => setEditingMessage((current) => ({ ...current, text: event.target.value }))}
              autoFocus
              rows={4}
            />
            <div className="edit-message-actions">
              <button className="edit-cancel-button" onClick={() => setEditingMessage(null)}>ยกเลิก</button>
              <button className="edit-save-button" onClick={saveEditedMessage}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal แสดงรูปภาพ/วิดีโอแบบเต็มจอ */}
      {previewMedia && (
        <div className="media-modal-overlay" onClick={() => setPreviewMedia(null)}>
          <div className="media-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="media-modal-close" onClick={() => setPreviewMedia(null)}>&times;</button>
            {previewMedia.type === 'image' ? (
              <img src={previewMedia.url} alt="รูปภาพขนาดเต็ม" />
            ) : (
              <video src={previewMedia.url} controls autoPlay />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMessageTime(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function MessageContent({ message, isOwnMessage, onMediaClick }) {
  if (message.message_type === 'deleted') {
    return <div className="deleted-text">{isOwnMessage ? 'คุณลบข้อความแล้ว' : 'ข้อความนี้ถูกลบแล้ว'}</div>;
  }

  if (message.message_type === 'image' || message.message_type === 'video' || message.message_type === 'file') {
    const fileUrl = `${API_URL}${message.file_url}`;
    if (message.message_type === 'image') {
      return (
        <img 
          className="message-image" 
          src={fileUrl} 
          alt={message.file_name} 
          onClick={() => onMediaClick?.(fileUrl, 'image')}
        />
      );
    }
    if (message.message_type === 'video') {
      return <video className="message-video" src={fileUrl} controls preload="metadata" />;
    }
    return <a className="message-file" href={fileUrl} download={message.file_name}>{message.file_name}</a>;
  }

  const messageText = message.message_text || message.message || '';
  let attachment;
  try {
    const parsed = JSON.parse(messageText);
    attachment = parsed?.type ? parsed : null;
  } catch {
    attachment = null;
  }

  if (attachment?.type === 'deleted') {
    return <div className="deleted-text">{isOwnMessage ? 'คุณลบข้อความแล้ว' : 'ข้อความนี้ถูกลบแล้ว'}</div>;
  }

  if (!attachment) return <div>{messageText}</div>;
  if (!attachment.url) return <div>{messageText}</div>;

  const fileUrl = `${API_URL}${attachment.url}`;
  if (attachment.type === 'image') {
    return (
      <img 
        className="message-image" 
        src={fileUrl} 
        alt={attachment.name} 
        onClick={() => onMediaClick?.(fileUrl, 'image')}
      />
    );
  }
  if (attachment.type === 'video') {
    return <video className="message-video" src={fileUrl} controls preload="metadata" />;
  }
  return <a className="message-file" href={fileUrl} download={attachment.name}>{attachment.name}</a>;
}

function MessageInput({ onSend, onSendAttachment, replyText, onReplyChange }) {
  const [text, setText] = React.useState(replyText || '');
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    if (replyText) setText(replyText);
  }, [replyText]);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text);
      setText('');
      onReplyChange?.('');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onSendAttachment) return;

    setUploading(true);
    try {
      await onSendAttachment(file);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="input-area">
      <label className="file-button">
        แนบไฟล์
        <input type="file" accept="image/*,video/*,application/*,text/*" onChange={handleFileChange} disabled={uploading} />
      </label>
      <input 
        type="text" 
        placeholder="พิมพ์ข้อความที่นี่..." 
        value={text} 
        onChange={(e) => setText(e.target.value)} 
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
      />
      <button onClick={handleSend} disabled={uploading}>ส่ง</button>
    </div>
  );
}

function MessageActions({ message, messageType, canDelete, canEdit, onReply, onEdit, onDelete }) {
  const [open, setOpen] = React.useState(false);
  const [openUpward, setOpenUpward] = React.useState(false);
  const menuButtonRef = React.useRef(null);
  const isAttachment = messageType === 'image' || messageType === 'video' || messageType === 'file' || (() => {
    try {
      const parsed = JSON.parse(message);
      return Boolean(parsed?.type && parsed?.url);
    } catch {
      return false;
    }
  })();
  const isDeleted = messageType === 'deleted' || (() => {
    try {
      return JSON.parse(message)?.type === 'deleted';
    } catch {
      return false;
    }
  })();

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setOpen(false);
  };

  if (isDeleted) return null;

  const toggleMenu = () => {
    if (!open && menuButtonRef.current) {
      const buttonRect = menuButtonRef.current.getBoundingClientRect();
      setOpenUpward(buttonRect.bottom + 150 > window.innerHeight);
    }
    setOpen((value) => !value);
  };

  return (
    <div className="message-actions">
      <button ref={menuButtonRef} className="message-menu-button" onClick={toggleMenu} aria-label="เมนูข้อความ">⌄</button>
      {open && (
        <div className={`message-menu ${openUpward ? 'open-upward' : ''}`}>
          <button onClick={() => { onReply(); setOpen(false); }}>ตอบกลับ</button>
          {canEdit && (
            <button onClick={() => {
              onEdit();
              setOpen(false);
            }}>แก้ไข</button>
          )}
          {!isAttachment && <button onClick={copyMessage}>คัดลอก</button>}
          {canDelete && <button className="delete-action" onClick={() => { onDelete(); setOpen(false); }}>ลบ</button>}
        </div>
      )}
    </div>
  );
}