import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { API_URL } from '../config';

export default function UserLogin({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const toggleMode = (registerState) => {
    setIsRegister(registerState);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister 
      ? { username, email, password } 
      : { email, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');

      // บันทึก Session ลง localStorage เพื่อให้อยู่ในระบบถาวร (Auto Login)
      localStorage.setItem('chat_user', JSON.stringify(data.user));
      localStorage.setItem('chat_token', data.token);

      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (!credentialResponse?.credential) {
      setError('Google ไม่ได้ส่ง credential มา กรุณาตรวจสอบ Authorized JavaScript origins');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้');

      localStorage.setItem('chat_user', JSON.stringify(data.user));
      localStorage.setItem('chat_token', data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-card">
        <h2>{isRegister ? 'สมัครสมาชิก Chat' : 'เข้าสู่ระบบ Chat'}</h2>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="input-group">
              <label>ชื่อผู้ใช้ (Username):</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="กรอกชื่อของคุณ"
                required 
              />
            </div>
          )}

          <div className="input-group">
            <label>อีเมล (Email):</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="example@mail.com"
              required 
            />
          </div>

          <div className="input-group">
            <label>รหัสผ่าน (Password):</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'กำลังดำเนินการ...' : isRegister ? 'ลงทะเบียน' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="divider"><span>หรือเข้าสู่ระบบด้วย</span></div>

        <div className="social-buttons">
          <div className="btn-google-container">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google Login ไม่สำเร็จ: ตรวจสอบ Client ID และ Authorized JavaScript origins ใน Google Cloud')}
              ux_mode="popup"
              useOneTap={false}
              theme="outline"
              size="medium"
              text="signin_with"
              shape="rectangular"
              width={145}
            />
          </div>
        </div>

        <div className="toggle-mode">
          {isRegister ? (
            <p>มีบัญชีอยู่แล้ว? <span onClick={() => toggleMode(false)}>เข้าสู่ระบบ</span></p>
          ) : (
            <p>ยังไม่มีบัญชี? <span onClick={() => toggleMode(true)}>สมัครสมาชิก</span></p>
          )}
        </div>
      </div>
    </div>
  );
}