"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../lib/types';
import { User, Circle, LogOut } from 'lucide-react';

interface UserListProps {
    currentUserId: string;
    onSelectUser: (user: UserProfile) => void;
    selectedUserId?: string;
}

export default function UserList({ currentUserId, onSelectUser, selectedUserId }: UserListProps) {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', currentUserId);

            if (error) console.error('Error fetching users:', error);
            else {
                // Fetch unread counts for each user
                const usersWithCounts = await Promise.all((data || []).map(async (user) => {
                    const { count, error: countError } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('sender_id', user.id)
                        .eq('receiver_id', currentUserId)
                        .or('read.is.null,read.eq.false');

                    if (countError) console.error('Error counting unread:', countError);
                    return { ...user, unread_count: count || 0 };
                }));

                setUsers(usersWithCounts);
            }
            setLoading(false);
        };

        fetchUsers();

        // Subscribe to message changes to update unread counts
        const channel = supabase
            .channel('user-list-updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
            }, () => {
                fetchUsers(); // Refetch when messages change
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId]);

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
                    <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', marginTop: '1rem' }}>No other users found.</p>
                ) : (
                    users.map(user => (
                        <button
                            key={user.id}
                            onClick={() => onSelectUser(user)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                background: selectedUserId === user.id ? 'var(--primary)' : 'transparent',
                                color: selectedUserId === user.id ? 'white' : 'var(--muted)',
                                transition: 'all 0.2s',
                                textAlign: 'left'
                            }}
                            onMouseEnter={(e) => {
                                if (selectedUserId !== user.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }}
                            onMouseLeave={(e) => {
                                if (selectedUserId !== user.id) e.currentTarget.style.background = 'transparent';
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
                                fontSize: '1rem'
                            }}>
                                {user.email.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selectedUserId === user.id ? 'white' : '#e2e8f0' }}>
                                    {user.email.split('@')[0]}
                                </div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '0.25rem', color: selectedUserId === user.id ? 'rgba(255,255,255,0.8)' : 'var(--muted)' }}>
                                    <Circle size={8} fill={selectedUserId === user.id ? "white" : "#22c55e"} stroke="none" />
                                    Online
                                </div>
                            </div>
                            {user.unread_count && user.unread_count > 0 && (
                                <div style={{
                                    background: '#ef4444',
                                    color: 'white',
                                    borderRadius: '9999px',
                                    minWidth: '1.25rem',
                                    height: '1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    padding: '0 0.375rem'
                                }}>
                                    {user.unread_count > 99 ? '99+' : user.unread_count}
                                </div>
                            )}
                        </button>
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
        </div>
    );
}
