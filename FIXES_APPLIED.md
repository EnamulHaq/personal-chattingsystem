# Fixes Applied

## 1. Unread Count Fix
- Changed query from `.eq('read', false)` to `.or('read.is.null,read.eq.false')`
- This handles cases where the `read` column might be NULL (if you haven't run the SQL migration yet)
- Added error logging to help debug count issues

## 2. Calling System Fix
- **Call button now disabled** when:
  - Already in a call
  - Receiving an incoming call
- **Shows "📞 Incoming..." indicator** in header when receiving a call
- **Incoming call modal** appears as overlay with Accept/Decline buttons
- Added extensive console logging to debug signaling issues

## 3. How Calling Should Work (Like Messenger)

### Scenario: User A calls User B

1. **User A clicks call button**
   - User A sees "In Call" status
   - Call button becomes mic mute/end call buttons
   
2. **User B receives the call**
   - User B sees incoming call modal overlay
   - Header shows "📞 Incoming..."
   - Call button is disabled
   - User B can Accept or Decline

3. **If User B accepts**
   - Both users enter call
   - Both can mute/unmute mic
   - Either can end the call

4. **If User B declines or User A ends before answer**
   - Both return to normal state
   - Call buttons re-enabled

## Debugging Steps

### If unread count still shows wrong numbers:

1. Open browser console (F12)
2. Look for "Error counting unread:" messages
3. Run this SQL to check your data:
```sql
SELECT sender_id, receiver_id, read, COUNT(*) 
FROM messages 
GROUP BY sender_id, receiver_id, read;
```

### If incoming call doesn't show:

1. Open console on BOTH browsers
2. User A clicks call
3. Check User A console for: "📡 Sending offer to: [User B ID]"
4. Check User B console for:
   - "📡 Received broadcast signal"
   - "✅ Processing signal: offer"
   - "📞 INCOMING CALL! Setting state..."
   
5. If User B doesn't see these logs, the issue is:
   - Broadcast not enabled in Supabase
   - User B is on wrong signaling channel
   - Network/firewall blocking WebSocket

### Common Issues:

**Issue**: Unread count stuck at 8/6
**Fix**: Run the SQL migration in `add_read_status.sql` to add the `read` column

**Issue**: Incoming call doesn't show
**Fix**: Check console logs. The signaling channel name is `signaling:[user_id]`. Make sure both users are subscribed to the correct channels.

**Issue**: Both users can call at same time
**Fix**: This is now prevented. Call button is disabled when `incomingCall` is true.

## Next Steps

1. **Run the SQL migration** from `add_read_status.sql`
2. **Test with two browsers**:
   - Open localhost:3000 in Chrome (User A)
   - Open localhost:3000 in Incognito/Firefox (User B)
3. **Check console logs** for any errors
4. **Test calling**:
   - User A calls User B
   - User B should see modal
   - User B accepts
   - Both should hear each other (check mic permissions!)
