"use client";

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { Heart, MessageCircle, Send, Image as ImageIcon, ThumbsUp, Share2, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Post {
    id: string;
    content: string;
    image_url?: string;
    created_at: string;
    user_id: string;
    profiles: {
        email: string;
        avatar_url?: string;
        full_name?: string;
    } | null;
    likes: { user_id: string }[];
    comments: { id: string, content: string, user_id: string, profiles: { full_name: string, email: string } }[];
    is_liked?: boolean;
    likes_count: number;
}

export default function SocialFeed({ session }: { session: Session }) {
    const [posts, setPosts] = useState<Post[]>([]);
    const [newPost, setNewPost] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [showComments, setShowComments] = useState<string | null>(null);
    const [commentText, setCommentText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchPosts = async () => {
        try {
            const { data, error } = await supabase
                .from('posts')
                .select(`
                    *,
                    profiles:user_id(email, avatar_url, full_name),
                    likes(user_id),
                    comments(*, profiles:user_id(full_name, email))
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching posts:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                return;
            }


            const processedPosts = (data || []).map(post => ({
                ...post,
                is_liked: post.likes?.some((l: any) => l.user_id === session.user.id) || false,
                likes_count: post.likes?.length || 0,
                comments: post.comments || []
            }));
            setPosts(processedPosts);
        } catch (err) {
            console.error('Fetch exception:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPosts();

        const channel = supabase.channel('feed-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, fetchPosts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, fetchPosts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, fetchPosts)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPost.trim() && !selectedImage) return;

        setPosting(true);
        let image_url = null;

        if (selectedImage) {
            const fileExt = selectedImage.name.split('.').pop();
            const fileName = `${session.user.id}_${Math.random()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('post-images')
                .upload(fileName, selectedImage);

            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(fileName);
                image_url = publicUrl;
            }
        }

        const { error } = await supabase.from('posts').insert([{
            content: newPost,
            user_id: session.user.id,
            image_url
        }]);

        if (error) {
            alert(error.message);
        } else {
            setNewPost('');
            setSelectedImage(null);
            setImagePreview(null);
            fetchPosts();
        }
        setPosting(false);
    };

    const toggleLike = async (post: Post) => {
        if (post.is_liked) {
            await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
        } else {
            await supabase.from('likes').insert([{ post_id: post.id, user_id: session.user.id }]);
        }
        // Optimistic update
        setPosts(prev => prev.map(p => {
            if (p.id === post.id) {
                return {
                    ...p,
                    is_liked: !p.is_liked,
                    likes_count: p.is_liked ? p.likes_count - 1 : p.likes_count + 1
                };
            }
            return p;
        }));
    };

    const handleAddComment = async (postId: string) => {
        if (!commentText.trim()) return;

        const { error } = await supabase.from('comments').insert([{
            post_id: postId,
            user_id: session.user.id,
            content: commentText
        }]);

        if (error) alert(error.message);
        else {
            setCommentText('');
            fetchPosts();
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(30, 41, 59, 0.4)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>Global Feed</h2>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Create Post */}
                <form onSubmit={handleCreatePost} className="glass-panel" style={{ padding: '1rem', borderRadius: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                    <textarea
                        value={newPost}
                        onChange={(e) => setNewPost(e.target.value)}
                        placeholder="What's on your mind?"
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: '1rem',
                            outline: 'none',
                            resize: 'none',
                            minHeight: '80px'
                        }}
                    />

                    {imagePreview && (
                        <div style={{ position: 'relative', marginTop: '1rem', borderRadius: '0.5rem', overflow: 'hidden' }}>
                            <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: '300px', objectFit: 'cover' }} />
                            <button
                                onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                                style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '0.25rem', color: 'white', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <ImageIcon size={20} /> Photo
                        </button>
                        <input type="file" hidden ref={fileInputRef} onChange={handleImageSelect} accept="image/*" />

                        <button
                            type="submit"
                            disabled={posting || (!newPost.trim() && !selectedImage)}
                            style={{
                                background: 'var(--primary)',
                                border: 'none',
                                borderRadius: '9999px',
                                padding: '0.5rem 1.5rem',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                opacity: posting || (!newPost.trim() && !selectedImage) ? 0.5 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {posting ? <Loader2 size={18} className="animate-spin" /> : 'Post'}
                        </button>
                    </div>
                </form>

                {/* Posts List */}
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
                        <div>Loading feed...</div>
                    </div>
                ) : posts.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '2rem', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem' }}>
                        <p>No posts yet, or there was an issue fetching them.</p>
                        <button
                            onClick={() => { setLoading(true); fetchPosts(); }}
                            style={{ marginTop: '1rem', background: 'var(--primary)', border: 'none', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
                        >
                            Retry Fetch
                        </button>
                    </div>
                ) : (

                    posts.map(post => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-panel"
                            style={{ padding: '1.5rem', borderRadius: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}
                        >
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{
                                    width: '3rem',
                                    height: '3rem',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(45deg, #818cf8, #c084fc)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    overflow: 'hidden'
                                }}>
                                    {post.profiles?.avatar_url ? (
                                        <img src={post.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        (post.profiles?.full_name?.[0] || post.profiles?.email?.[0] || '?').toUpperCase()
                                    )}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 'bold', color: 'white' }}>
                                        {post.profiles?.full_name || post.profiles?.email?.split('@')[0] || 'Unknown User'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{new Date(post.created_at).toLocaleString()}</div>
                                </div>
                            </div>

                            <p style={{ color: '#e2e8f0', lineHeight: 1.6, marginBottom: '1.5rem' }}>{post.content}</p>

                            {post.image_url && (
                                <div style={{ marginBottom: '1.5rem', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <img src={post.image_url} alt="Post" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', background: 'rgba(0,0,0,0.2)' }} />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', marginBottom: showComments === post.id ? '1rem' : 0 }}>
                                <button
                                    onClick={() => toggleLike(post)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: post.is_liked ? '#ef4444' : 'var(--muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Heart size={20} fill={post.is_liked ? '#ef4444' : 'none'} />
                                    <span>{post.likes_count}</span>
                                </button>
                                <button
                                    onClick={() => setShowComments(showComments === post.id ? null : post.id)}
                                    style={{ background: 'none', border: 'none', color: showComments === post.id ? 'white' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                                >
                                    <MessageCircle size={20} />
                                    <span>{post.comments?.length || 0}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (navigator.share) {
                                            navigator.share({ title: 'Check out this post!', text: post.content, url: window.location.href });
                                        } else {
                                            alert('Share feature not supported on this browser');
                                        }
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                                >
                                    <Share2 size={20} />
                                </button>
                            </div>

                            {/* Comments Section */}
                            <AnimatePresence>
                                {showComments === post.id && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem' }}>
                                            {post.comments.map(comment => (
                                                <div key={comment.id} style={{ display: 'flex', gap: '0.75rem' }}>
                                                    <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                        {(comment.profiles?.full_name?.[0] || comment.profiles?.email?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem' }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '0.875rem', color: 'white' }}>{comment.profiles?.full_name || comment.profiles?.email?.split('@')[0]}</div>
                                                        <div style={{ fontSize: '0.875rem', color: '#e2e8f0' }}>{comment.content}</div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                <input
                                                    type="text"
                                                    value={commentText}
                                                    onChange={(e) => setCommentText(e.target.value)}
                                                    placeholder="Write a comment..."
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                                                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '9999px', padding: '0.5rem 1rem', color: 'white', outline: 'none', fontSize: '0.875rem' }}
                                                />
                                                <button
                                                    onClick={() => handleAddComment(post.id)}
                                                    style={{ background: 'var(--primary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}
                                                >
                                                    <Send size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}

