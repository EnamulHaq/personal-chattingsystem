"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Auth from "../components/Auth";
import UserList from "../components/UserList";
import PrivateChat from "../components/PrivateChat";
import { UserProfile } from "../lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Session } from "@supabase/supabase-js";
import { MessageSquare, Globe, Settings, Layout } from "lucide-react";

import SocialFeed from "../components/SocialFeed";
import UserSettings from "../components/UserSettings";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'feed' | 'settings'>('chat');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '100vh' }}>
        <div className="animate-pulse-slow" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: '2rem', background: 'radial-gradient(circle at top center, #1e293b 0%, #0f172a 100%)' }}>
      {!session ? (
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '1rem', background: 'linear-gradient(to right, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              NextChat
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ fontSize: '1.2rem', color: 'var(--muted)' }}
            >
              Connect with anyone, anywhere. Secure and fast.
            </motion.p>
          </div>
          <Auth />
        </div>
      ) : (
        <div className="glass" style={{ height: 'calc(100vh - 4rem)', maxWidth: '1400px', margin: '0 auto', display: 'flex', overflow: 'hidden', borderRadius: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--glass-border)' }}>

          {/* Main App Navigation (Left Slim Bar) */}
          <div style={{ width: '70px', background: 'rgba(15, 23, 42, 0.6)', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 0', gap: '2rem' }}>
            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(45deg, #818cf8, #c084fc)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Layout size={24} />
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <button
                onClick={() => setActiveTab('chat')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'chat' ? 'white' : 'var(--muted)', position: 'relative' }}
              >
                <MessageSquare size={24} />
                {activeTab === 'chat' && <motion.div layoutId="nav-dot" style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '4px', background: 'var(--primary)', borderRadius: '50%' }} />}
              </button>

              <button
                onClick={() => setActiveTab('feed')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'feed' ? 'white' : 'var(--muted)', position: 'relative' }}
              >
                <Globe size={24} />
                {activeTab === 'feed' && <motion.div layoutId="nav-dot" style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '4px', background: 'var(--primary)', borderRadius: '50%' }} />}
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'settings' ? 'white' : 'var(--muted)', position: 'relative' }}
              >
                <Settings size={24} />
                {activeTab === 'settings' && <motion.div layoutId="nav-dot" style={{ position: 'absolute', right: '-12px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '4px', background: 'var(--primary)', borderRadius: '50%' }} />}
              </button>
            </nav>
          </div>

          <div style={{ flex: 1, display: 'flex', width: '100%' }}>
            <AnimatePresence mode="wait">
              {activeTab === 'chat' && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{ display: 'flex', width: '100%', height: '100%' }}
                >
                  {/* Chat Sidebar */}
                  <div style={{ width: '320px', borderRight: '1px solid var(--glass-border)', background: 'rgba(30, 41, 59, 0.4)' }}>
                    <UserList
                      currentUserId={session.user.id}
                      onSelectUser={setActiveUser}
                      selectedUserId={activeUser?.id}
                    />
                  </div>

                  {/* Chat Content */}
                  <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.2)', position: 'relative' }}>
                    {activeUser ? (
                      <PrivateChat session={session} chatPartner={activeUser} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                        <div style={{ width: '5rem', height: '5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '2.5rem' }}>👋</span>
                        </div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>Welcome, {session.user.email?.split('@')[0]}!</h3>
                        <p>Select a friend to start chatting.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'feed' && (
                <motion.div
                  key="feed"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <SocialFeed session={session} />
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <UserSettings session={session} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </main>
  );
}
