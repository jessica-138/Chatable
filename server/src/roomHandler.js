// import these functions
const { generateRoomCode, createRoomObject } = require('./functions');

// exporting this function to server.js
module.exports = function(io, socket, rooms, socket_room) {
    
    // --------------------------------------- CREATE -----------------------------------------------------------
    socket.on("create-room", ({ username, durationMins }, callback) => {
        // if this client is alrdy in a room
        if (socket_room[socket.id]) {
            return callback({ success: false, error: "You are already inside a room!" });
        }
        
        // username validation - if invalid, send to the frontend's callback
        if (!username || username.trim() === ""){
            return callback({ success: false, error: "Username is required" });
        }

        // Duration validation - convert duration mins (might be string) into integer(base 10) 
        let minutes = parseInt(durationMins, 10);
        if (isNaN(minutes) || minutes <= 0){              // if Not-A-Number or <=0, default=60 mins
            minutes = 60; 
        }
        
        // Room code - generate
        const roomCode = generateRoomCode(rooms);

        // hostUser obj - create
        const hostUser ={
            // generate userId
            userId: Math.random().toString(36).substring(2, 11), // converts random no to base-36
            socketId: socket.id,
            username: username.trim(),
            joinedAt: Date.now()
        };

        // update rooms object
        rooms[roomCode] = createRoomObject(roomCode, hostUser, minutes);

        // update socket_room object
        // needed for easy deletion of socket if the user disconnects
        socket_room[socket.id] = roomCode

        // JOIN Socket.IO ROOM CHANNEL
        // Places the user's socket connection into a virtual scoket.io room
        // allows server to easily broadcast messages
        socket.join(roomCode);

        console.log(`CREATED: Room ${roomCode} created by ${username}. Expires in ${minutes} minutes. (for developer)`);

        callback({
            success: true,
            roomCode: roomCode,
            user: hostUser,
            expiresAt: rooms[roomCode].expiresAt
        });
    });


    // --------------------------------------------------- JOIN -------------------------------------------------------------
    socket.on("join-room", ({username, roomCode}, callback) =>{
        // 0. if socket alrdy in a room
        if(socket_room[socket.id]){
            return callback({success:false, error: "You are already inside a room"})
        }

        // 1. username and code validation
        if(!username || username.trim() === ""){
            return callback({success:false, error:"Username is required!"})
        }
        if(!roomCode || roomCode.trim() === ""){
            return callback({success:false, error:"Roomcode is required!"})
        }

        const code = roomCode.trim().toUpperCase()
        const targetRoom = rooms[code]   // room obj

        // 2. Validation - does the room exist?
        if(!targetRoom){
            return callback({success:false, error:"Room Not Found!"})
        }

        // 3. Validation : has the room expired?
        // this is lazy deletion. but we also use the active cleanup method which makes sure that old rooms are deleted from the memory by doing a search and cleanup after fixed intervals of time
        if(Date.now() > targetRoom.expiresAt){
            delete rooms[code]
            return callback({success:false, error:"This room has already expired and vanished!"})
        }

        // UNIQUE USERNAMES
        const final_username = username.trim()
        const username_alrdy_exists = targetRoom.users.find(user => user.username === final_username)
        if(username_alrdy_exists){
            return callback({success:false, error:"username already taken!"})
        }

        // 4. create user object - if username is new and unique
        const newuser = {
            userId: Math.random().toString(36).substring(2,11), // 9-letter alphanumeric
            socketId: socket.id,
            username: final_username,
            joinedAt: Date.now()
        }

        // memory objs
        targetRoom.users.push(newuser)
        socket_room[socket.id] = code

        // socket.io joins the virtual room 
        socket.join(code)
        console.log(`JOINED: User ${username} joined room ${roomCode}`)

        socket.to(code).emit("user-joined", newuser)
        callback({
            success:true,
            room:targetRoom,
            user:newuser
        })
    })

    // ----------------------------------------------- SEND MESSAGE --------------------------------------------------------------------
    socket.on("send-message", (data) =>{
        const code = socket_room[socket.id]
        if(!code || !rooms[code]) return
        
        const sender = rooms[code].users.find(u => u.socketId === socket.id)
        const username = sender ? sender.username : "Anonymous"

        const message = {
            text: data.text, 
            sender: username,
            senderSocketId: socket.id,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            //id = `{socket.id}-${Date.now()}`
        }

        rooms[code].messages.push(message)
        io.to(code).emit("receive-message", message)
    })

    // ------------------------------------ LEAVE (thru leave button) ----------------------------------
    socket.on("leave-room", (callback)=>{
        const code = socket_room[socket.id]
        if(code && rooms[code]){
            const targetroom = rooms[code]
            const leavinguser = targetroom.users.find(u=> u.socketId === socket.id)

            if (leavinguser) {
                targetroom.users = targetroom.users.filter(u => u.socketId !== socket.id);
                console.log(`${leavinguser.username} left room ${code}`);
                // notify the room
                socket.to(code).emit("user-left", { socketId: socket.id, username: leavinguser.username });
            }

            socket.leave(code)
            if(targetroom.users.length === 0){
                delete rooms[code]
            }
        }
        delete socket_room[socket.id]
        if(callback) callback({success:true})
    })

    socket.on("resume-session", ({roomCode, username}, callback) => {
        if(!rooms[roomCode]){   // if room exists
            return callback({success: false});
        }

        // Find the user in the room's user list
        const userInRoom = rooms[roomCode].users.find(u => u.username === username);
        if (userInRoom) {
            userInRoom.isDisconnected = false;  // Reset their state so the timeout is ignored!
            userInRoom.socketId = socket.id;     // Update to their brand-new Socket ID
        }

        socket.join(roomCode);  //put user's new socket id into socket.io room channel  
        socket_room[socket.id] = roomCode;  // update socket_room

        const chatHistory = rooms[roomCode].messages || [];
        callback({
            success: true,
            roomCode: roomCode,
            history: chatHistory,
            users:  rooms[roomCode].users,
            hostName: rooms[roomCode].host.username
        })

        socket.to(roomCode).emit("reconnected-message", {
            sender: "System",
            text: `${username} reconnected.`,
            timestamp: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
        })
    })

};

