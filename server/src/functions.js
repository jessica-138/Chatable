// creates a random 5-letter uppercase room code that doesnt already exist
async function generateRoomCode(redis){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
    let code = '';
    do{
        for (let i=0; i<5; i++){
            let x = chars.charAt(Math.floor(Math.random() * chars.length))
            code += x
        }
    }while(await redis.exists(`chatable:room:${code}:meta`)) // to ensure uniqueness
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

// export these functions
module.exports = {
    generateRoomCode,
    createRoomObject
}
