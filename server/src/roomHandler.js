const { generateRoomCode, createRoomObject } = require('./functions');
const store = require('./redisStore');
const { MAX_ROOM_DURATION } = require('./config');

const remainingMs = (room) => room.expiresAt - Date.now();

module.exports = function registerRoomHandler(io, socket, redis) {
    socket.on('create-room', async ({ username, durationMins }, callback) => {
        try {
            if (await redis.exists(store.keys.socketRoom(socket.id))) return callback({ success: false, error: 'You are already inside a room!' });
            if (!username || !username.trim()) return callback({ success: false, error: 'Username is required' });
            const minutes = Number(durationMins);
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ROOM_DURATION) {
                return callback({ success: false, error: `Room duration must be between 1 and ${MAX_ROOM_DURATION} minutes.` });
            }
            const roomCode = await generateRoomCode(redis);
            const hostUser = { userId: Math.random().toString(36).substring(2, 11), socketId: socket.id, username: username.trim(), joinedAt: Date.now() };
            const room = createRoomObject(roomCode, hostUser, minutes);
            const ttlMs = remainingMs(room);
            await store.createRoom(redis, room, ttlMs);
            await redis.pSetEx(store.keys.socketRoom(socket.id), ttlMs, roomCode);
            socket.join(roomCode);
            callback({ success: true, roomCode, user: hostUser, expiresAt: room.expiresAt });
        } catch (error) { console.error('create-room failed', error); callback({ success: false, error: 'Unable to create room.' }); }
    });

    socket.on('join-room', async ({ username, roomCode }, callback) => {
        try {
            if (await redis.exists(store.keys.socketRoom(socket.id))) return callback({ success: false, error: 'You are already inside a room' });
            if (!username || !username.trim()) return callback({ success: false, error: 'Username is required!' });
            if (!roomCode || !roomCode.trim()) return callback({ success: false, error: 'Roomcode is required!' });
            const code = roomCode.trim().toUpperCase();
            const room = await store.getRoom(redis, code);
            if (!room || remainingMs(room) <= 0) return callback({ success: false, error: 'Room Not Found or expired!' });
            const finalUsername = username.trim();
            if (await store.getUser(redis, code, finalUsername)) return callback({ success: false, error: 'Username already taken!' });
            const user = { userId: Math.random().toString(36).substring(2, 11), socketId: socket.id, username: finalUsername, joinedAt: Date.now() };
            const ttlMs = remainingMs(room);
            const userCount = await store.addUserIfRoomHasCapacity(redis, code, user, ttlMs);
            if (userCount > store.MAX_USERS) return callback({ success: false, error: `Room is full (maximum ${store.MAX_USERS} users).` });
            await redis.pSetEx(store.keys.socketRoom(socket.id), ttlMs, code);
            socket.join(code);
            const updatedRoom = await store.getRoom(redis, code);
            socket.to(code).emit('user-joined', user);
            callback({ success: true, room: updatedRoom, user });
        } catch (error) { console.error('join-room failed', error); callback({ success: false, error: 'Unable to join room.' }); }
    });

    socket.on('send-message', async (data) => {
        try {
            const code = await redis.get(store.keys.socketRoom(socket.id));
            if (!code) return;
            const room = await store.getRoom(redis, code);
            if (!room || remainingMs(room) <= 0) return;
            const sender = room.users.find((user) => user.socketId === socket.id);
            if (!sender || !data.text) return;
            const message = { text: data.text, sender: sender.username, senderSocketId: socket.id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            await store.addMessage(redis, code, message, remainingMs(room));
            io.to(code).emit('receive-message', message);
        } catch (error) { console.error('send-message failed', error); }
    });

    socket.on('leave-room', async (callback) => {
        try { await leaveRoom(io, socket, redis); callback?.({ success: true }); }
        catch (error) { console.error('leave-room failed', error); callback?.({ success: false }); }
    });

    socket.on('resume-session', async ({ roomCode, username }, callback) => {
        try {
            const code = roomCode?.trim().toUpperCase();
            const room = code && await store.getRoom(redis, code);
            const user = room && await store.getUser(redis, code, username);
            if (!room || !user || remainingMs(room) <= 0) return callback({ success: false });
            user.socketId = socket.id;
            user.isDisconnected = false;
            const ttlMs = remainingMs(room);
            await store.putUser(redis, code, user, ttlMs);
            await redis.pSetEx(store.keys.socketRoom(socket.id), ttlMs, code);
            socket.join(code);
            const updatedRoom = await store.getRoom(redis, code);
            callback({ success: true, roomCode: code, history: updatedRoom.messages, users: updatedRoom.users, hostName: updatedRoom.host.username });
            socket.to(code).emit('reconnected-message', { sender: 'System', text: `${username} reconnected.`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } catch (error) { console.error('resume-session failed', error); callback({ success: false }); }
    });
};

async function leaveRoom(io, socket, redis) {
    const code = await redis.get(store.keys.socketRoom(socket.id));
    if (!code) return;
    const room = await store.getRoom(redis, code);
    if (room) {
        const user = room.users.find((member) => member.socketId === socket.id);
        if (user) {
            await store.deleteUser(redis, code, user.username);
            socket.to(code).emit('user-left', { socketId: socket.id, username: user.username });
            if ((await store.getUsers(redis, code)).length === 0) await store.deleteRoom(redis, code);
        }
    }
    await redis.del(store.keys.socketRoom(socket.id));
    socket.leave(code);
}

module.exports.leaveRoom = leaveRoom;
