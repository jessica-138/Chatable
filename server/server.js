const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const { createClient } = require('redis');
const io = new Server(server, {
    cors : {
        origin : "*",
        methods: ["GET", "POST"]
    }  //allows frontend to connect
});

const path = require('path')

// IMPORT THE HANDLER from roomHandler.js
const registerRoomHandler = require('./src/roomHandler');
const store = require('./src/redisStore');
const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redis.on('error', (error) => console.error('Redis error:', error.message));

app.use(express.static(path.join(__dirname, "..", "client"))) // serves frontend files

app.get('/', (req,res)=>{
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'))
});

io.on("connection", (socket) => {
    console.log(`A user connected with Socket id = ${socket.id} (for developer)`)

    // link handler to the incoming socket
    registerRoomHandler(io, socket, redis)

    // DISCONNECTION LOGIC
    // when someone accidentally disconnects (like a refresh)
    // - delayed leaving - in order to allow reconnection
    socket.on("disconnect", async () =>{
        try {
            const code = await redis.get(store.keys.socketRoom(socket.id));
            const room = code && await store.getRoom(redis, code);
            const user = room && room.users.find((member) => member.socketId === socket.id);
            await redis.del(store.keys.socketRoom(socket.id));
            if (!code || !room || !user) return;
            user.isDisconnected = true;
            await store.putUser(redis, code, user, Math.max(room.expiresAt - Date.now(), 1));
            
            setTimeout(async () => {
                const current = await store.getUser(redis, code, user.username);
                if (current?.isDisconnected) {
                    await store.deleteUser(redis, code, user.username);
                    io.to(code).emit('user-left', { socketId: socket.id, username: user.username });
                    if ((await store.getUsers(redis, code)).length === 0) await store.deleteRoom(redis, code);
                }
            }, 10000);
        } catch (error) { console.error('disconnect cleanup failed', error); }
    })
})

const PORT = process.env.PORT || 5000;

async function start() {
    await redis.connect();
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch((error) => {
    console.error('Could not connect to Redis:', error.message);
    process.exit(1);
});
