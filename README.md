# Chatable

Chatable is a real-time disappearing chat app where users can create temporary chat rooms, invite others with a room code, and exchange messages instantly. Rooms expire after a selected duration, and users can reconnect after brief accidental disconnects.

## Features

- Create temporary chat rooms with unique room codes
- Join existing rooms using a username and room code
- Send and receive real-time messages with Socket.IO
- Show active users in each room
- Display message history when a new user joins
- Align your own messages to the right and other users' messages to the left
- Automatically expire rooms after the selected lifetime
- Recover sessions after quick refreshes or accidental disconnects

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js
- Express
- Socket.IO

## Project Structure

```text
chat-final/
+-- client/
|   +-- index.html
|   +-- script.js
|   +-- style.css
+-- server/
|   +-- server.js
|   +-- src/
|       +-- functions.js
|       +-- roomHandler.js
+-- package.json
+-- README.md
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

For development with auto-restart:

```bash
npm run devStart
```

Then open:

```text
http://localhost:5000
```

## How It Works

1. A user creates a room by entering a username and room lifetime.
2. The server generates a unique room code.
3. Other users can join using that room code.
4. Messages are broadcast instantly to everyone in the room.
5. Chat history is stored in memory while the room is active.
6. When the room expires, users are notified and the room is removed from memory.

## Notes

- Room data is stored in server memory, so it resets when the server restarts.
- This project is intended as a real-time chat app demo using Socket.IO.

