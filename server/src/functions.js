// creates a random 5-letter uppercase room code that doesnt already exist
function generateRoomCode(rooms){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
    let code = '';
    do{
        for (let i=0; i<5; i++){
            let x = chars.charAt(Math.floor(Math.random() * chars.length))
            code += x
        }
    }while(rooms[code]) // to ensure uniqueness
    return code
}


// create a NEW ROOM object 
function createRoomObject(code, hostUser, durationMins){
    const now = Date.now()
    const lifespan = durationMins * 60 * 1000; // in ms

    return {
        code: code,
        host: {
            userId: hostUser.userId,
            socketId: hostUser.socketId,
            username: hostUser.username
        },
        createdAt: now,
        expiresAt: now + lifespan,
        users:[hostUser],   // hostUser is in the same format as users object
        messages:[]
    }
}



// starts a persistent background interval to sweep away expired rooms from memory.
// EVERY 5 SECONDS
function startRoomCleanup(rooms, socket_room, io) {
    // executes continuously every 5 seconds (5000ms)
    setInterval(() => {
        const now = Date.now();

        // Loop through every root-level key (room code) inside your rooms state
        for (const code in rooms) {
            // Check if the current clock time has bypassed the room's deadline
            if (now > rooms[code].expiresAt) {
                console.log(`Active Cleanup: Room ${code} has expired`);

                // 1. Broadcast a crash warning event to everyone connected to that channel
                io.to(code).emit("room-expired", { message: "This room has expired!" });

                // 2. Loop through all registered members inside this room and strip them from lookups
                rooms[code].users.forEach(user => {
                    delete socket_room[user.socketId];
                });

                // 3. Delete the root pointer from the global state, clearing RAM
                delete rooms[code];
            }
        }
    }, 5000); 
}


// export these functions
module.exports = {
    generateRoomCode,
    createRoomObject,
    startRoomCleanup
}