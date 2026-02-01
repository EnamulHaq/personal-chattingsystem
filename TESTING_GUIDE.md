# How to Test Calling System

## Setup (IMPORTANT!)

1. **Open TWO browser windows side by side**
   - Window 1: Chrome (normal)
   - Window 2: Chrome Incognito (or Firefox)

2. **Login as DIFFERENT users in each window**
   - Window 1: Login as `enamul@boomdevs.com`
   - Window 2: Login as `mdenamulhaq6263@gmail.com`

3. **Select each other in the contact list**
   - Window 1: Click on `mdenamulhaq6263` in contacts
   - Window 2: Click on `enamul` in contacts

4. **Open Console (F12) in BOTH windows**

## Test Call

### Step 1: User A Initiates Call

In Window 1 (enamul), click the green phone button.

**Expected console output in Window 1:**
```
📞 Starting call...
📞 My ID: [enamul's user ID]
📞 Calling: [mdenamulhaq's user ID] mdenamulhaq6263@gmail.com
📞 Sending to channel: signaling:[mdenamulhaq's user ID]
📞 Sending offer via signaling channel
```

### Step 2: User B Receives Call

**Expected console output in Window 2:**
```
📡 Received broadcast signal: {type: "offer", senderId: "[enamul's ID]", ...}
📡 Sender ID: [enamul's ID] Expected: [enamul's ID]
✅ Processing signal: offer
📞 INCOMING CALL! Setting state...
📞 Incoming call state set. Modal should appear.
```

**Expected UI in Window 2:**
- Beautiful modal overlay appears
- Shows caller's name and avatar
- Accept/Decline buttons

### Step 3: User B Accepts

Click "Accept" button in Window 2.

**Expected:**
- Both users enter call
- Both see "In Call" status
- Audio should work (you might need to allow microphone permissions)

## Troubleshooting

### Issue: "Ignoring signal from different user"

**Cause**: The sender ID doesn't match the expected chat partner ID.

**Fix**: Make sure BOTH users have selected EACH OTHER in the contacts list.

**Check**:
1. In Window 1 console, look for: `📞 Calling: [ID] [email]`
2. In Window 2 console, look for: `🔔 Listening for calls from: [ID] [email]`
3. **These IDs must match!**

### Issue: No broadcast signal received

**Cause**: Supabase Broadcast not working or wrong channel.

**Fix**:
1. Check Supabase Dashboard → Settings → API
2. Make sure Realtime is enabled
3. Check console for channel subscription status

### Issue: Modal doesn't appear even with correct logs

**Cause**: React state not updating or modal rendering issue.

**Fix**:
1. Check for JavaScript errors in console
2. Try refreshing both windows
3. Make sure you're running latest code

## What the Console Should Show

### Window 1 (Caller):
```
🔔 Joining signaling channel: signaling:[my-id]
🔔 Listening for calls from: [partner-id] partner@email.com
📞 Starting call...
📞 My ID: [my-id]
📞 Calling: [partner-id] partner@email.com
📞 Sending to channel: signaling:[partner-id]
📞 Sending offer via signaling channel
```

### Window 2 (Receiver):
```
🔔 Joining signaling channel: signaling:[my-id]
🔔 Listening for calls from: [partner-id] partner@email.com
📡 Received broadcast signal: {type: "offer", senderId: "[partner-id]", ...}
📡 Sender ID: [partner-id] Expected: [partner-id]
✅ Processing signal: offer
📞 INCOMING CALL! Setting state...
```

**The IDs in "Sender ID" and "Expected" MUST match!**
