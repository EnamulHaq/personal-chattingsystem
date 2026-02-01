export interface PMessage {
    id: string;
    created_at: string;
    content: string;
    sender_id: string;
    receiver_id: string;
    read?: boolean;
    read_at?: string;
    user_id?: string;
    user_email?: string;
}

export interface UserProfile {
    id: string;
    email: string;
    status?: 'online' | 'offline' | 'in-call';
    unread_count?: number;
}
