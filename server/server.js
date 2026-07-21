const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors : {
        origin : "*",
        methods: ["GET", "POST"]
    }  //allows frontend to connect
});

const path = require('path')

// IMPORT THE HANDLER from roomHandler.js
const registerRoomHandler = require('./src/roomHandler')
const {startRoomCleanup} = require("./src/functions")

const rooms={};
const socket_room = {};

app.use(express.static(path.join(__dirname, "..", "client"))) // serves frontend files

app.get('/', (req,res)=>{
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'))
});

io.on("connection", (socket) => {
    console.log(`A user connected with Socket id = ${socket.id} (for developer)`)

    // link handler to the incoming socket
    registerRoomHandler(io, socket, rooms, socket_room)

    // DISCONNECTION LOGIC
    // when someone accidentally disconnects(like refresh) 
    // - delayed leaving - in order to allow reconnection
    socket.on("disconnect", () =>{
        const code = socket_room[socket.id]

        if(code && rooms[code]){    // if room exists
            const targetroom = rooms[code]
            const leavinguser = targetroom.users.find(u=> u.socketId === socket.id)

            if(leavinguser){
                leavinguser.isDisconnected = true;  // temporarily mark as disconnected
                
                // Give a 10 second grace period to reconnect before wiping their data
                setTimeout(()=>{
                    const usercheck = targetroom.users.find(u => u.username === leavinguser.username);
                    if(usercheck && usercheck.isDisconnected){  // fetch user again to check if they re there and marked as disconnected
                        // 1. Tell everyone they're gone
                        io.to(code).emit("user-left", {
                            socketId: socket.id,
                            username: leavinguser.username
                        })
                        
                        //2. Remove them from rooms[code]
                        targetroom.users = targetroom.users.filter(u=> u.username !== leavinguser.username);
                        console.log(`LEFT: ${leavinguser.username}`);

                        // 3. Clean up room if there are no users left
                        const activeUsers = targetroom.users.filter(u => !u.isDisconnected);
                        if(activeUsers.length === 0){
                            delete rooms[code];
                            console.log(`Cleaned up - empty room destroyed`);
                        }
                    }
                }, 10000);

            }
            delete socket_room[socket.id]
        }
    })
})

// Run background interval check
startRoomCleanup(rooms, socket_room, io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});