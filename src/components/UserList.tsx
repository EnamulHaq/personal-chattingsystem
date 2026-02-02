"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../lib/types';
import { User, Circle, LogOut, UserPlus, Check } from 'lucide-react';

interface UserListProps {
    currentUserId: string;
    onSelectUser: (user: UserProfile) => void;
    selectedUserId?: string;
}

export default function UserList({ currentUserId, onSelectUser, selectedUserId }: UserListProps) {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchEmail, setSearchEmail] = useState('');
    const [searchError, setSearchError] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch all profiles EXCEPT ME
                const { data: allProfiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .neq('id', currentUserId);

                if (profilesError) throw profilesError;

                // 2. Fetch my friendship relations
                const { data: relations, error: relError } = await supabase
                    .from('friends')
                    .select('*')
                    .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

                if (relError) throw relError;

                // 3. Map status to each user
                const processedUsers = await Promise.all((allProfiles || []).map(async (profile) => {
                    const relation = relations?.find(r =>
                        (r.user_id === profile.id && r.friend_id === currentUserId) ||
                        (r.friend_id === profile.id && r.user_id === currentUserId)
                    );

                    let friendStatus: 'none' | 'pending' | 'accepted' | 'incoming' = 'none';
                    let requestId = null;

                    if (relation) {
                        requestId = relation.id;
                        if (relation.status === 'accepted') {
                            friendStatus = 'accepted';
                        } else { // status is 'pending'
                            friendStatus = relation.user_id === currentUserId ? 'pending' : 'incoming';
                        }
                    }

                    // Get unread count
                    const { count } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('sender_id', profile.id)
                        .eq('receiver_id', currentUserId)
                        .or('read.is.null,read.eq.false');

                    return {
                        ...profile,
                        friendStatus,
                        requestId,
                        unread_count: count || 0
                    };
                }));

                setUsers(processedUsers);
            } catch (err) {
                console.error('Fetch error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const channel = supabase.channel('global-user-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [currentUserId]);

    const handleFriendAction = async (user: any) => {
        if (user.friendStatus === 'none') {
            await supabase.from('friends').insert([{ user_id: currentUserId, friend_id: user.id, status: 'pending' }]);
        } else if (user.friendStatus === 'incoming') {
            await supabase.from('friends').update({ status: 'accepted' }).eq('id', user.requestId);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (loading) return <div style={{ padding: '1rem', color: 'rgba(255,255,255,0.5)' }}>Loading users...</div>;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--sidebar-bg)' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={20} /> Contacts
                </h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {users.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.875rem', marginTop: '1rem' }}>No users found.</p>
                ) : (
                    users.map((user: any) => (
                        <div
                            key={user.id}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                background: selectedUserId === user.id ? 'var(--primary)' : 'rgba(255,255,255,0.02)',
                                transition: 'all 0.2s',
                                border: '1px solid var(--glass-border)'
                            }}
                        >
                            <div style={{
                                width: '2.5rem',
                                height: '2.5rem',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '1rem',
                                overflow: 'hidden'
                            }}>
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()
                                )}
                            </div>

                            <div
                                style={{ flex: 1, overflow: 'hidden', cursor: user.friendStatus === 'accepted' ? 'pointer' : 'default' }}
                                onClick={() => user.friendStatus === 'accepted' && onSelectUser(user)}
                            >
                                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#e2e8f0' }}>
                                    {user.full_name || user.email.split('@')[0]}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    {user.friendStatus === 'accepted' ? (
                                        <><Circle size={8} fill="#22c55e" stroke="none" /> Online</>
                                    ) : (
                                        <span style={{ color: '#eab308' }}>Not Friends</span>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {user.unread_count > 0 && (
                                    <div style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                        {user.unread_count}
                                    </div>
                                )}

                                {user.friendStatus === 'none' && (
                                    <button onClick={() => handleFriendAction(user)} style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>
                                        Add
                                    </button>
                                )}
                                {user.friendStatus === 'pending' && (
                                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Sent</span>
                                )}
                                {user.friendStatus === 'incoming' && (
                                    <button onClick={() => handleFriendAction(user)} style={{ background: 'var(--success)', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '10px', cursor: 'pointer' }}>
                                        Accept
                                    </button>
                                )}
                                {user.friendStatus === 'accepted' && (
                                    <div style={{ color: 'var(--success)' }}><Check size={16} /></div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Logout Button */}
            <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                <button
                    onClick={handleLogout}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                        border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                >
                    <LogOut size={18} />
                    Logout
                </button>
            </div>
        </div >
    );
}
