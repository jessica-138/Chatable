const PREFIX = "chatable";
const { MAX_USERS, MAX_MESSAGES } = require('./config');

const keys = {
    meta: (code) => `${PREFIX}:room:${code}:meta`,
    users: (code) => `${PREFIX}:room:${code}:users`,
    messages: (code) => `${PREFIX}:room:${code}:messages`,
    socketRoom: (socketId) => `${PREFIX}:socket:${socketId}:room`
};

async function roomExists(redis, code) {
    return Boolean(await redis.exists(keys.meta(code)));
}

async function getRoom(redis, code) {
    const meta = await redis.hGetAll(keys.meta(code));
    if (!meta.code) return null;

    const [users, messageStrings] = await Promise.all([
        redis.hVals(keys.users(code)),
        redis.lRange(keys.messages(code), 0, -1)
    ]);
    return {
        code: meta.code,
        host: JSON.parse(meta.host),
        createdAt: Number(meta.createdAt),
        expiresAt: Number(meta.expiresAt),
        users: users.map(JSON.parse),
        messages: messageStrings.map(JSON.parse)
    };
}

async function createRoom(redis, room, ttlMs) {
    const expiry = Date.now() + ttlMs;
    const multi = redis.multi();
    multi.hSet(keys.meta(room.code), {
        code: room.code,
        host: JSON.stringify(room.host),
        createdAt: String(room.createdAt),
        expiresAt: String(room.expiresAt)
    });
    multi.hSet(keys.users(room.code), room.host.username, JSON.stringify(room.host));
    for (const key of [keys.meta(room.code), keys.users(room.code), keys.messages(room.code)]) {
        multi.pExpireAt(key, expiry);
    }
    await multi.exec();
}

async function putUser(redis, code, user, ttlMs) {
    const multi = redis.multi();
    multi.hSet(keys.users(code), user.username, JSON.stringify(user));
    multi.pExpire(keys.users(code), ttlMs);
    await multi.exec();
}

async function addUserIfRoomHasCapacity(redis, code, user, ttlMs) {
    const result = await redis.eval(`
        local usersKey = KEYS[1]
        local username = ARGV[1]
        local userJson = ARGV[2]
        local ttlMs = tonumber(ARGV[3])
        local maxUsers = tonumber(ARGV[4])
        redis.call('HSET', usersKey, username, userJson)
        local count = redis.call('HLEN', usersKey)
        if count > maxUsers then
            redis.call('HDEL', usersKey, username)
            return count - 1
        end
        redis.call('PEXPIRE', usersKey, ttlMs)
        return count
    `, {
        keys: [keys.users(code)],
        arguments: [user.username, JSON.stringify(user), String(ttlMs), String(MAX_USERS)]
    });
    return Number(result);
}

async function getUser(redis, code, username) {
    const user = await redis.hGet(keys.users(code), username);
    return user ? JSON.parse(user) : null;
}

async function deleteUser(redis, code, username) {
    await redis.hDel(keys.users(code), username);
}

async function getUsers(redis, code) {
    return (await redis.hVals(keys.users(code))).map(JSON.parse);
}

async function addMessage(redis, code, message, ttlMs) {
    const multi = redis.multi();
    multi.rPush(keys.messages(code), JSON.stringify(message));
    multi.lTrim(keys.messages(code), -MAX_MESSAGES, -1);
    multi.pExpire(keys.messages(code), ttlMs);
    await multi.exec();
}

async function deleteRoom(redis, code) {
    await redis.del([keys.meta(code), keys.users(code), keys.messages(code)]);
}

module.exports = { MAX_USERS, keys, roomExists, getRoom, createRoom, putUser, addUserIfRoomHasCapacity, getUser, deleteUser, getUsers, addMessage, deleteRoom };
