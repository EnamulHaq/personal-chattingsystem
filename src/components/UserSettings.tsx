"use client";

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { User, Lock, Camera, Save, Loader2 } from 'lucide-react';

export default function UserSettings({ session }: { session: Session }) {
    const [loading, setLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const getProfile = async () => {
            const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            if (data) {
                setFullName(data.full_name || '');
                setAvatarUrl(data.avatar_url || '');
            }
        };
        getProfile();
    }, [session.user.id]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.from('profiles').update({
            full_name: fullName,
            avatar_url: avatarUrl
        }).eq('id', session.user.id);

        if (error) alert(error.message);
        else alert('Profile updated!');
        setLoading(false);
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword) return;
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) alert(error.message);
        else {
            alert('Password updated!');
            setNewPassword('');
        }
        setLoading(false);
    };

    const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.user.id}_avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });

        if (uploadError) {
            alert("Upload error: Make sure you created the 'avatars' bucket in Supabase storage and set it to public!");
        } else {
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            setAvatarUrl(publicUrl);
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id);
        }
        setLoading(false);
    };

    return (
        <div style={{ height: '100%', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', padding: '2rem' }}>
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', marginBottom: '2rem' }}>Settings</h2>

                {/* Avatar Section */}
                <div className="glass-panel" style={{ padding: '2rem', borderRadius: '1.5rem', marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ position: 'relative' }}>
                        <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'linear-gradient(45deg, #818cf8, #c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={60} color="white" />
                            )}
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{ position: 'absolute', bottom: '0', right: '0', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                            <Camera size={18} />
                        </button>
                        <input type="file" hidden ref={fileInputRef} onChange={uploadAvatar} accept="image/*" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>{session.user.email}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Upload a profile picture</div>
                    </div>
                </div>

                {/* Profile Form */}
                <form onSubmit={handleUpdateProfile} className="glass-panel" style={{ padding: '2rem', borderRadius: '1.5rem', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={20} /> Personal Information
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.75rem', color: 'white', outline: 'none' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{ marginTop: '1.5rem', width: '100%', padding: '0.75rem', background: 'var(--primary)', border: 'none', borderRadius: '0.5rem', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                    >
                        {loading && <Loader2 size={18} className="animate-spin" />}
                        <Save size={18} /> Save Profile
                    </button>
                </form>

                {/* Password Form */}
                <form onSubmit={handleUpdatePassword} className="glass-panel" style={{ padding: '2rem', borderRadius: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Lock size={20} /> Security
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 6 characters"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', padding: '0.75rem', color: 'white', outline: 'none' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !newPassword}
                        style={{ marginTop: '1.5rem', width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        Update Password
                    </button>
                </form>
            </div>
        </div>
    );
}
