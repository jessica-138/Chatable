// frontend js
// ESTABLISHES CONNECTION - initialises persistent connection to socket.io server
// triggers the "connection" event on server side, SENDS socket object
const socket = io()

const viewWelcome = document.getElementById("view-welcome")
const viewCreate = document.getElementById("view-create")
const viewJoin = document.getElementById("view-join")
const viewChat = document.getElementById("view-chat");

function showview(targetview){
    // keep everything as hidden .. remove hidden for whichever needs to be shown
    viewWelcome.classList.add("hidden")
    viewCreate.classList.add("hidden")
    viewJoin.classList.add("hidden")
    viewChat.classList.add("hidden")

    targetview.classList.remove("hidden")
}

const createChooseBtn = document.getElementById("create-choose")
const joinChooseBtn = document.getElementById("join-choose")
const cancelbtns = document.querySelectorAll(".back-btn")  // elements with className = back-btn

createChooseBtn.addEventListener("click", () => {
    showview(viewCreate)
})
joinChooseBtn.addEventListener("click", ()=>{
    showview(viewJoin)
})

// cancelbtn is an array of all the elements with classname = back-btn
cancelbtns.forEach(btn =>{
    btn.addEventListener("click", ()=>{
        // clear all the inputs
        document.getElementById("create-username").value = ""
        document.getElementById("join-username").value = ""
        document.getElementById("join-code").value = ""

        showview(viewWelcome)
    })
})

// FUNCTIONS
function renderMessage(msg_packet){
    const message_bubble = document.createElement("div")

    const curr_username = sessionStorage.getItem("activeUser")
    const isOwnMessage = msg_packet.sender === curr_username;
    message_bubble.classList.add("message-bubble", isOwnMessage ? "own-message" : "other-message")

    const sender = document.createElement("span")
    sender.classList.add("msg-sender")
    sender.textContent = msg_packet.sender

    const text = document.createElement("span")
    text.classList.add("msg-text")
    text.textContent = msg_packet.text

    const time = document.createElement("span")
    time.classList.add("msg-time")
    time.textContent = msg_packet.timestamp

    message_bubble.appendChild(sender)
    message_bubble.appendChild(text)
    message_bubble.appendChild(time)
    messages_container.appendChild(message_bubble)
    messages_container.scrollTop = messages_container.scrollHeight // so that user doesnt have to scroll down to see the data

}

function renderUserList(userarray, hostname){
    userlist.innerHTML = "";
    userarray.forEach(u => {
        const member = document.createElement("li");
        if(u.username === hostname){
            member.textContent = `${u.username} (Host)`;
        }
        else{
            member.textContent = u.username;
        }
        userlist.appendChild(member);
    })
}


// ----------------- RECONNECTION (after accidental loss  of connection) ----------------------------
socket.on("connect", ()=>{
    const savedroom = sessionStorage.getItem("activeRoom");
    const saveduser = sessionStorage.getItem("activeUser");

    // if yes, then user is RECONNECTING
    if(savedroom && saveduser){
        socket.emit("resume-session", {roomCode:savedroom, username:saveduser}, (response) =>{
            if(response.success){  // success if the room still exists
                console.log("Session recovered!");
                displayroomcode.textContent = savedroom;
                messages_container.innerHTML = "";
                if (response.history) {
                    response.history.forEach(msg => {
                        renderMessage(msg); 
                    });
                }

                if(response.users){
                    // Use the actual host returned by the server response (or fallback to response.host)
                    const actualHost = response.hostName; 
                    renderUserList(response.users, actualHost);
                }
                showview(viewChat);
            }
            else{
                sessionStorage.clear();
                showview(viewWelcome);
                alert("Your session expired or room vanished!");
            }
        })
    }
    else{
        showview(viewWelcome);
    }
})


// --------------------------------------------------- CREATE LOGIC -------------------------------------------------------

const createbtn = document.getElementById("create-btn")
const displayroomcode = document.getElementById("display-roomcode")
const userlist = document.getElementById("user-list")

createbtn.addEventListener("click", ()=>{
    // taking the username and room_dur as input, 
    // EMIT the asynchronous event
    const username = document.getElementById("create-username").value
    const durationMins = document.getElementById("room-dur").value

    //{ username, durationMinutes } is exactly equal to { username: username, durationMinutes: durationMinutes }
    // 3rd argument is our asynchronous callback
    // this funcn is saved locally in memory . not executed immediately. waits for server to send back acknowledgement
    socket.emit("create-room", {username, durationMins}, function callback(response) {
        if(response.success){
            if (response.expiresAt) {
                const expiryDate = new Date(response.expiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                console.log("Room expires at:", expiryDate);
            }
            console.log("current room info: ", response)

            displayroomcode.textContent = response.roomCode
            userlist.innerHTML = ""
            const hostElement = document.createElement("li")
            hostElement.textContent =  `${username} (Host)`
            userlist.appendChild(hostElement)

            sessionStorage.setItem("activeRoom", response.roomCode);
            sessionStorage.setItem("activeUser", username);

            showview(viewChat)
        }
        else{
            alert("Error: " + response.error)
        }
    })

    document.getElementById("create-username").value= ""
    document.getElementById("room-dur").value = ""
})

// ------------------------------------------------- JOIN LOGIC ------------------------------------------------------

const joinbtn = document.getElementById("join-btn")
joinbtn.addEventListener("click", ()=>{
    const username = document.getElementById("join-username").value
    const roomCode = document.getElementById("join-code").value
    
    socket.emit("join-room", {username,roomCode}, (response)=>{
        if(response.success){
            alert(`Joined room ${response.room.code}!\nWelcome ${response.user.username}`)
            displayroomcode.textContent = response.room.code
            userlist.innerHTML = ""
            messages_container.innerHTML = "";

            const hostName = response.room.host.username;

            response.room.users.forEach(user =>{
                const memberElement = document.createElement("li");
                if (user.username === hostName){
                    memberElement.textContent = `${user.username} (Host)`;
                } 
                else{
                    memberElement.textContent = user.username;
                }
                userlist.appendChild(memberElement);
            })

            // for storing in the frontend session
            sessionStorage.setItem("activeRoom", response.room.code);
            sessionStorage.setItem("activeUser", username);

            if(response.room.messages){
                response.room.messages.forEach(msg => {
                    renderMessage(msg);
                });
            }
            showview(viewChat)
        }
        else{
            alert("Error joining room. " + response.error)
        }
    })
})

// ----------------------------------------- SEND MESSAGE LOGIC ----------------------------------------------------------

const msgsendbtn = document.getElementById("msg-send-btn")
const messages_container = document.getElementById("messages")
const msginput = document.getElementById("msg-input")

function handle_send(){
    const msg = msginput.value.trim()
    if(!msg) return

    socket.emit("send-message", {text:msg})

    msginput.value=""
    msginput.focus()
}

msgsendbtn.addEventListener("click", handle_send)    // clicking send btn to send message 
msginput.addEventListener("keydown", (event)=>{     // pressing enter to send message
    if(event.key == "Enter"){
        handle_send()
    }
})

// -------------------------------- RECEIVE - MESSAGE -----------------------------------------------

socket.on("receive-message", (msg_packet) => {
    renderMessage(msg_packet);
})

// ----------------------------- LEAVE BUTTON ---------------------------------------------
const leavebtn = document.getElementById("leave-btn")
leavebtn.addEventListener("click", () => {
    socket.emit("leave-room", (response) => {
        if (response.success) {
            alert("You have safely left the room.");
            sessionStorage.clear()
            // UI Hook: Swap views back to the home entry dashboard here
            document.getElementById("create-username").value = "";
            document.getElementById("join-username").value = "";
            document.getElementById("join-code").value = "";
            showview(viewWelcome)
        }
        else{
            alert(`error in leaving room`)
        }
    });
});


// NETWORK BROADCASTERS
// event sent by server to all users alrdy in a room, hwne a new user enters
socket.on("user-joined", (newuser) =>{
    console.log(`${newuser.username} has joined the room!`)

    // Create a new list item for the sidebar list array
    const newMember = document.createElement("li");
    newMember.textContent = newuser.username;
    userlist.appendChild(newMember);
    
    // Add a small system notification message inside the chat box
    const systemNotice = document.createElement("div");
    systemNotice.style.fontStyle = "italic";
    systemNotice.style.color = "#777";
    systemNotice.style.textAlign = "center";
    systemNotice.style.margin = "5px 0";
    systemNotice.textContent = `${newuser.username} entered the chat.`;
    messages_container.appendChild(systemNotice);
})

socket.on("user-left", (data) => {
    console.log(`${data.username} left`)

    const listItems = userlist.getElementsByTagName("li");
    for (let i = 0; i < listItems.length; i++) {
        if (listItems[i].textContent === data.username || listItems[i].textContent === `${data.username} (Host)`) {
            listItems[i].remove();
            break;
        }
    }

    // Add a clean exit notification banner to the message log tray
    const systemNotice = document.createElement("div");
    systemNotice.style.fontStyle = "italic";
    systemNotice.style.color = "#999";
    systemNotice.style.textAlign = "center";
    systemNotice.style.margin = "5px 0";
    systemNotice.textContent = `${data.username} left the chat.`;
    messages_container.appendChild(systemNotice);
})

socket.on("room-expired", (data) => {
    alert(data.message)
    sessionStorage.clear();
    document.getElementById("create-username").value = "";
    document.getElementById("join-username").value = "";
    document.getElementById("join-code").value = "";
    document.getElementById("display-roomcode").textContent = "XXXX";
    document.getElementById("user-list").innerHTML = "";
    document.getElementById("messages").innerHTML = "";
    showview(viewWelcome)
})


socket.on("reconnected-message", (msg_packet) => {
    // create a system notification div
    const systemNotice = document.createElement("div");
    systemNotice.style.fontStyle = "italic";
    systemNotice.style.color = "#4CAF50";
    systemNotice.style.textAlign = "center";
    systemNotice.style.margin = "5px 0";
    systemNotice.textContent = msg_packet.text; // "Username reconnected."

    // append to messages_container and auto-scroll to bottom
    messages_container.appendChild(systemNotice);
    messages_container.scrollTop = messages_container.scrollHeight;
})
