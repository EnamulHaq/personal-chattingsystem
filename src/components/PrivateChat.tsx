"use client";

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PMessage, UserProfile } from '../lib/types';
import { Send, Phone, PhoneOff, Mic, MicOff, Check, CheckCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Session } from '@supabase/supabase-js';

interface PrivateChatProps {
    session: Session;
    chatPartner: UserProfile;
}

export default function PrivateChat({ session, chatPartner }: PrivateChatProps) {
    const [messages, setMessages] = useState<PMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [subStatus, setSubStatus] = useState<'CONNECTING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED'>('CONNECTING');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Call State
    const [inCall, setInCall] = useState(false);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [micActive, setMicActive] = useState(true);
    const [localVolume, setLocalVolume] = useState(0);
    const [remoteVolume, setRemoteVolume] = useState(0);
    const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
    const [incomingCall, setIncomingCall] = useState(false);
    const [incomingOffer, setIncomingOffer] = useState<RTCSessionDescriptionInit | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Typing & Sound
    const [partnerIsTyping, setPartnerIsTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const resumeAudioContext = async () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as unknown as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    };

    const playNotificationSound = async () => {
        const ctx = await resumeAudioContext();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    };

    // Play/stop ringtone based on incoming call state
    useEffect(() => {
        if (incomingCall) {
            const AudioContextClass = (window.AudioContext || (window as unknown as Window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
            const audioContext = new AudioContextClass();

            // Create a more "natural" dual-tone ring (like a real phone)
            const createRing = () => {
                const osc1 = audioContext.createOscillator();
                const osc2 = audioContext.createOscillator();
                const gain = audioContext.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.value = 400; // Standard UK/European ring components
                osc2.frequency.value = 450;

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioContext.destination);

                return { osc1, osc2, gain };
            };

            let isRinging = true;
            const playNaturalRing = async () => {
                while (isRinging) {
                    try {
                        const { osc1, osc2, gain } = createRing();

                        // Start Ring 1
                        gain.gain.setValueAtTime(0, audioContext.currentTime);
                        gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
                        osc1.start();
                        osc2.start();

                        // Stop Ring 1 after 400ms
                        gain.gain.setValueAtTime(0.2, audioContext.currentTime + 0.4);
                        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

                        // Start Ring 2 after 200ms gap
                        gain.gain.setValueAtTime(0, audioContext.currentTime + 0.7);
                        gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.8);

                        // Stop Ring 2 after 400ms
                        gain.gain.setValueAtTime(0.2, audioContext.currentTime + 1.1);
                        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1.2);

                        // Cleanup oscillators after the double ring is done
                        setTimeout(() => {
                            osc1.stop();
                            osc2.stop();
                            osc1.disconnect();
                            osc2.disconnect();
                        }, 1500);

                        // Wait for the full cycle (approx 3 seconds)
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (e) {
                        console.error("Ringtone error:", e);
                        break;
                    }
                }
            };

            playNaturalRing();

            const resumeAudio = () => {
                if (audioContext.state === 'suspended') audioContext.resume();
            };
            window.addEventListener('click', resumeAudio);

            return () => {
                isRinging = false;
                window.removeEventListener('click', resumeAudio);
                audioContext.close();
            };
        }
    }, [incomingCall]);

    // Mark message as read
    const markAsRead = async (messageId: string) => {
        await supabase
            .from('messages')
            .update({ read: true, read_at: new Date().toISOString() })
            .eq('id', messageId)
            .eq('receiver_id', session.user.id);
    };

    // --- Fetch & Subscribe Messages ---
    useEffect(() => {
        setMessages([]);

        // 1. Fetch History
        const fetchHistory = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${chatPartner.id}),and(sender_id.eq.${chatPartner.id},receiver_id.eq.${session.user.id})`)
                .order('created_at', { ascending: true });

            if (error) console.error('Error fetching private history:', error);
            else {
                setMessages(data || []);
                // Mark all seen messages as read
                const unreadIds = (data || [])
                    .filter(m => m.receiver_id === session.user.id && !m.read)
                    .map(m => m.id);

                if (unreadIds.length > 0) {
                    await supabase
                        .from('messages')
                        .update({ read: true, read_at: new Date().toISOString() })
                        .in('id', unreadIds);
                }
            }
        };
        fetchHistory();

        // 2. Subscribe to new messages
        console.log("Subscribing to messages...");
        const channel = supabase
            .channel(`chat:${session.user.id}:${chatPartner.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
            }, (payload) => {
                const newMsg = payload.new as PMessage;
                console.log("Realtime event received:", newMsg);

                const isFromPartner = newMsg.sender_id === chatPartner.id && newMsg.receiver_id === session.user.id;
                const isFromMe = newMsg.sender_id === session.user.id && newMsg.receiver_id === chatPartner.id;

                if (isFromPartner || isFromMe) {
                    setMessages(prev => {
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });

                    if (isFromPartner) {
                        playNotificationSound();
                        markAsRead(newMsg.id);
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
            }, (payload) => {
                const updatedMsg = payload.new as PMessage;
                setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
            })
            .subscribe((status) => {
                setSubStatus(status as 'CONNECTING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED');
                console.log("Message subscription status:", status);
            });

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatPartner.id, session.user.id]);

    // Send signal via the persistent channel TO THE PARTNER
    const sendSignal = async (type: string, data: Record<string, unknown>) => {
        const partnerChannel = `signaling:${chatPartner.id}`;
        console.log(`📡 Sending ${type} to channel:`, partnerChannel);

        await supabase.channel(partnerChannel).send({
            type: 'broadcast',
            event: 'call-signal',
            payload: { type, senderId: session.user.id, ...data }
        });
    };

    const sendTypingStatus = (isTyping: boolean) => {
        const typingChannel = `signaling:${chatPartner.id}`;
        supabase.channel(typingChannel).send({
            type: 'broadcast',
            event: 'typing',
            payload: { isTyping, senderId: session.user.id }
        });
    };

    // --- Audio Recording ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await uploadAudio(audioBlob);
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Recording error:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const uploadAudio = async (blob: Blob) => {
        const fileName = `${session.user.id}_${Date.now()}.webm`;
        const { data, error } = await supabase.storage
            .from('chat-attachments')
            .upload(fileName, blob);

        if (error) {
            console.error("Upload error:", error);
            return;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(fileName);

        // Send message with audio
        await supabase.from('messages').insert([{
            content: 'Voice Message',
            type: 'audio',
            file_url: publicUrl,
            sender_id: session.user.id,
            receiver_id: chatPartner.id
        }]);
    };

    const endCall = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            sendSignal('end-call', {});
        }
        peerConnectionRef.current = null;
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.pause();
            remoteAudioRef.current.srcObject = null;
        }
        setLocalStream(null);
        setLocalVolume(0);
        setRemoteVolume(0);
        setInCall(false);
        setIncomingCall(false);
        setIncomingOffer(null);
        pendingCandidatesRef.current = [];
    };

    const startCall = async () => {
        try {
            console.log("📞 Starting call...");
            await resumeAudioContext();
            console.log("📞 Calling:", chatPartner.id, chatPartner.email);
            console.log("📞 Sending to channel: signaling:" + chatPartner.id);

            setInCall(true);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            // Monitor local audio levels
            const audioCtx = audioContextRef.current!;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkVolume = () => {
                if (!stream.active) return;
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setLocalVolume(avg);
                requestAnimationFrame(checkVolume);
            };
            checkVolume();

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            stream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, stream));

            pc.oniceconnectionstatechange = () => {
                console.log("🧊 caller ICE Connection State:", pc.iceConnectionState);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    sendSignal('candidate', { candidate: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0] || new MediaStream([event.track]);
                console.log("🔊 Remote tracks:", remoteStream.getTracks().map(t => t.kind));

                // Monitor remote volume
                if (audioContextRef.current) {
                    const ctx = audioContextRef.current;
                    const source = ctx.createMediaStreamSource(remoteStream);
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    const checkRemote = () => {
                        if (pc.signalingState === 'closed') return;
                        analyser.getByteFrequencyData(data);
                        const avg = data.reduce((a, b) => a + b) / data.length;
                        setRemoteVolume(avg);
                        requestAnimationFrame(checkRemote);
                    };
                    checkRemote();
                }

                if (remoteAudioRef.current) {
                    console.log("🔊 Setting srcObject on hidden audio element");
                    remoteAudioRef.current.srcObject = remoteStream;
                    remoteAudioRef.current.play().then(() => {
                        console.log("🔊 Remote audio playing successfully!");
                    }).catch(e => {
                        console.error("🔊 Audio play error (browser policy?):", e);
                    });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            console.log("📞 Sending offer via signaling channel");
            sendSignal('offer', { offer });

            peerConnectionRef.current = pc;
        } catch (err) {
            console.error("Error starting call:", err);
            alert("Failed to start call. Please check microphone permissions.");
            setInCall(false);
        }
    };

    const acceptCall = async (offer: RTCSessionDescriptionInit) => {
        try {
            setInCall(true);
            setIncomingCall(false);
            await resumeAudioContext();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            // Monitor local audio levels
            const audioCtx = audioContextRef.current!;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkVolume = () => {
                if (!stream.active) return;
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setLocalVolume(avg);
                requestAnimationFrame(checkVolume);
            };
            checkVolume();

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            stream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, stream));

            pc.oniceconnectionstatechange = () => {
                console.log("🧊 receiver ICE Connection State:", pc.iceConnectionState);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    sendSignal('candidate', { candidate: event.candidate });
                }
            };

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0] || new MediaStream([event.track]);
                console.log("🔊 Remote tracks:", remoteStream.getTracks().map(t => t.kind));

                // Monitor remote volume
                if (audioContextRef.current) {
                    const ctx = audioContextRef.current;
                    const source = ctx.createMediaStreamSource(remoteStream);
                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    const checkRemote = () => {
                        if (pc.signalingState === 'closed') return;
                        analyser.getByteFrequencyData(data);
                        const avg = data.reduce((a, b) => a + b) / data.length;
                        setRemoteVolume(avg);
                        requestAnimationFrame(checkRemote);
                    };
                    checkRemote();
                }

                if (remoteAudioRef.current) {
                    console.log("🔊 Setting srcObject on hidden audio element");
                    remoteAudioRef.current.srcObject = remoteStream;
                    remoteAudioRef.current.play().then(() => {
                        console.log("🔊 Remote audio playing successfully!");
                    }).catch(e => {
                        console.error("🔊 Audio play error (browser policy?):", e);
                    });
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal('answer', { answer });
            peerConnectionRef.current = pc;

            // Process any pending candidates
            while (pendingCandidatesRef.current.length > 0) {
                const candidate = pendingCandidatesRef.current.shift();
                if (candidate) await pc.addIceCandidate(candidate);
            }
        } catch (err) {
            console.error("Error accepting call:", err);
            alert("Failed to accept call. Please check microphone permissions.");
            setInCall(false);
            setIncomingCall(false);
        }
    };

    const declineCall = () => {
        setIncomingCall(false);
        setIncomingOffer(null);
        sendSignal('end-call', {});
    };

    // --- WebRTC Signaling Channel ---
    useEffect(() => {
        const channelName = `signaling:${session.user.id}`;
        console.log("🔔 Joining signaling channel:", channelName);
        console.log("🔔 Listening for calls from:", chatPartner.id, chatPartner.email);

        const signalingChannel = supabase.channel(channelName)
            .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
                // ... (rest of the call signal logic)
                if (payload.senderId !== chatPartner.id) return;

                if (payload.type === 'offer') {
                    setIncomingCall(true);
                    setIncomingOffer(payload.offer);
                } else if (payload.type === 'answer') {
                    if (peerConnectionRef.current) {
                        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
                        while (pendingCandidatesRef.current.length > 0) {
                            const candidate = pendingCandidatesRef.current.shift();
                            if (candidate) await peerConnectionRef.current.addIceCandidate(candidate);
                        }
                    }
                } else if (payload.type === 'candidate') {
                    if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
                        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
                    } else {
                        pendingCandidatesRef.current.push(new RTCIceCandidate(payload.candidate));
                    }
                } else if (payload.type === 'end-call') {
                    endCall();
                }
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload.senderId === chatPartner.id) {
                    setPartnerIsTyping(payload.isTyping);
                }
            })
            .subscribe();

        signalingChannelRef.current = signalingChannel;

        return () => {
            console.log("🔔 Cleaning up signaling channel");
            supabase.removeChannel(signalingChannel);
            // Clean up call state when switching partners
            if (inCall || incomingCall) {
                endCall();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatPartner.id, session.user.id]); // Removed peerConnection from deps

    // Toggle mic
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = micActive;
            });
        }
    }, [micActive, localStream]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const { error } = await supabase
            .from('messages')
            .insert([
                {
                    content: newMessage,
                    sender_id: session.user.id,
                    receiver_id: chatPartner.id,
                    user_id: session.user.id,
                    user_email: session.user.email,
                    read: false
                }
            ]);

        if (error) {
            console.error('Error sending message:', error.message, error.details || '', error.hint || '');
            alert(`Failed to send: ${error.message}`);
        } else {
            setNewMessage('');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Tiny audio element for remote stream (visibility:hidden instead of display:none for reliability) */}
            <audio ref={remoteAudioRef} autoPlay style={{ position: 'fixed', top: -100, left: -100, width: 1, height: 1, opacity: 0.1 }} />
            {/* Incoming Call Modal */}
            {incomingCall && incomingOffer && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                }}>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1))',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '1.5rem',
                            padding: '2rem',
                            textAlign: 'center',
                            minWidth: '300px'
                        }}
                    >
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3b82f6, #9333ea)',
                            margin: '0 auto 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2rem'
                        }}>
                            {chatPartner.email[0].toUpperCase()}
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>
                            {chatPartner.email.split('@')[0]}
                        </h3>
                        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
                            📞 Incoming audio call...
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button
                                onClick={declineCall}
                                style={{
                                    padding: '1rem 2rem',
                                    borderRadius: '9999px',
                                    background: '#ef4444',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                            >
                                <PhoneOff size={20} />
                                Decline
                            </button>
                            <button
                                onClick={() => incomingOffer && acceptCall(incomingOffer)}
                                style={{
                                    padding: '1rem 2rem',
                                    borderRadius: '9999px',
                                    background: 'var(--success)',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#16a34a'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--success)'}
                            >
                                <Phone size={20} />
                                Accept
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Header */}
            <div className="glass-panel" style={{
                padding: '1rem',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(15, 23, 42, 0.4)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '0.75rem',
                        height: '0.75rem',
                        borderRadius: '50%',
                        background: subStatus === 'SUBSCRIBED' ? 'var(--success)' : '#eab308'
                    }} title={subStatus} />
                    <div>
                        <h3 style={{ fontWeight: 'bold', color: 'white' }}>{chatPartner.email}</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{subStatus === 'SUBSCRIBED' ? 'Connected' : 'Connecting...'}</span>
                    </div>
                </div>
                <div>
                    {!inCall && !incomingCall ? (
                        <button
                            onClick={startCall}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '50%',
                                background: 'var(--success)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s',
                                cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#16a34a'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--success)'}
                        >
                            <Phone size={20} />
                        </button>
                    ) : incomingCall ? (
                        <div style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '9999px',
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e',
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            animation: 'pulse 2s infinite'
                        }}>
                            📞 Incoming...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            {/* Partner's volume meter (Blue) */}
                            <div style={{ display: 'flex', gap: '2px', height: '16px', alignItems: 'center' }} title="Partner's Volume">
                                {[1, 2, 3].map(i => (
                                    <motion.div
                                        key={i}
                                        animate={{ height: [4 + (remoteVolume / 2) * Math.random(), 4 + (remoteVolume / 1.5) * Math.random(), 4 + (remoteVolume / 2) * Math.random()] }}
                                        transition={{ duration: 0.1 }}
                                        style={{ width: '3px', background: remoteVolume > 10 ? '#3b82f6' : 'rgba(255,255,255,0.2)', borderRadius: '1px' }}
                                    />
                                ))}
                            </div>

                            <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#4ade80' }}>In Call</span>

                            <button
                                onClick={async () => {
                                    await resumeAudioContext();
                                    if (remoteAudioRef.current && peerConnectionRef.current) {
                                        const receivers = peerConnectionRef.current.getReceivers();
                                        const stream = new MediaStream(receivers.map(r => r.track).filter(t => t.kind === 'audio'));
                                        if (stream.getTracks().length > 0) {
                                            remoteAudioRef.current.srcObject = null;
                                            remoteAudioRef.current.srcObject = stream;
                                            remoteAudioRef.current.play().catch(e => console.error("Manual play error:", e));
                                        }
                                    }
                                    alert("Audio system re-initialized. Speak now!");
                                }}
                                style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '4px',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}
                            >
                                FIX AUDIO
                            </button>

                            {/* My volume meter (Green) */}
                            {micActive && (
                                <div style={{ display: 'flex', gap: '2px', height: '16px', alignItems: 'center' }} title="My Volume">
                                    {[1, 2, 3].map(i => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: micActive ? [4 + (localVolume / 2) * Math.random(), 4 + (localVolume / 1.5) * Math.random(), 4 + (localVolume / 2) * Math.random()] : 4 }}
                                            transition={{ duration: 0.1 }}
                                            style={{ width: '3px', background: localVolume > 10 ? '#4ade80' : 'rgba(255,255,255,0.3)', borderRadius: '1px' }}
                                        />
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => setMicActive(!micActive)}
                                title={micActive ? "Mute Mic" : "Unmute Mic"}
                                style={{
                                    padding: '0.6rem',
                                    borderRadius: '50%',
                                    background: micActive ? 'rgba(255,255,255,0.1)' : '#ef4444',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {micActive ? <Mic size={18} /> : <MicOff size={18} />}
                            </button>
                            <button
                                onClick={endCall}
                                title="End Call"
                                style={{
                                    padding: '0.6rem',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <PhoneOff size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((msg) => {
                    const isMe = msg.sender_id === session.user.id;
                    return (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                display: 'flex',
                                justifyContent: isMe ? 'flex-end' : 'flex-start'
                            }}
                        >
                            <div style={{
                                maxWidth: '70%',
                                padding: '0.75rem 1rem',
                                borderRadius: '1rem',
                                borderBottomRightRadius: isMe ? 0 : '1rem',
                                borderBottomLeftRadius: isMe ? '1rem' : 0,
                                background: isMe ? 'var(--message-sent)' : 'var(--message-received)',
                                color: 'white',
                                position: 'relative'
                            }}>
                                {msg.type === 'audio' ? (
                                    <div style={{ minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Voice Message</div>
                                        <audio
                                            src={msg.file_url}
                                            controls
                                            style={{ height: '32px', filter: 'invert(1) opacity(0.8)' }}
                                        />
                                    </div>
                                ) : (
                                    <div>{msg.content}</div>
                                )}
                                {isMe && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        marginTop: '0.25rem',
                                        opacity: 0.7,
                                        fontSize: '0.75rem'
                                    }}>
                                        {msg.read === true ? (
                                            <CheckCheck size={14} color="#4ade80" />
                                        ) : (
                                            <Check size={14} color="rgba(255,255,255,0.6)" />
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {partnerIsTyping && (
                <div style={{ padding: '0 1rem 0.5rem', fontSize: '0.75rem', color: '#4ade80', fontStyle: 'italic' }}>
                    {chatPartner.email.split('@')[0]} is typing...
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSendMessage} style={{
                padding: '1rem',
                borderTop: '1px solid var(--glass-border)',
                background: 'rgba(15, 23, 42, 0.4)'
            }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                            setNewMessage(e.target.value);
                            sendTypingStatus(true);
                            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                            typingTimeoutRef.current = setTimeout(() => {
                                sendTypingStatus(false);
                            }, 2000);
                        }}
                        placeholder="Type a message..."
                        style={{
                            width: '100%',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'white',
                            borderRadius: '9999px',
                            padding: '0.75rem 1.5rem',
                            paddingRight: '3rem',
                            border: '1px solid var(--glass-border)',
                            outline: 'none'
                        }}
                    />
                    <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        style={{
                            position: 'absolute',
                            right: '3rem',
                            padding: '0.5rem',
                            background: isRecording ? '#ef4444' : 'rgba(255,255,255,0.1)',
                            borderRadius: '50%',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            animation: isRecording ? 'pulse 1s infinite' : 'none'
                        }}
                        title={isRecording ? "Stop Recording" : "Record Voice Message"}
                    >
                        <Mic size={18} />
                    </button>
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        style={{
                            position: 'absolute',
                            right: '0.5rem',
                            padding: '0.5rem',
                            background: 'var(--primary)',
                            borderRadius: '50%',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: !newMessage.trim() ? 0.5 : 1,
                            cursor: !newMessage.trim() ? 'default' : 'pointer'
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
}
