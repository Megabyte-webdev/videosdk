import { MeetingState } from "../dist/MeetingState.js";
import { VideoSDKCore } from "../dist/VideoSDKCore.js";

const meetingState = new MeetingState();

// ---------------- ELEMENTS ----------------
const localVideo = document.getElementById("localVideo");
const videosContainer = document.getElementById("videosContainer");

const screenStage = document.getElementById("screenStage");
const screenVideo = document.getElementById("screenVideo");
const screenLabel = document.getElementById("screenLabel");

const userNameInput = document.getElementById("userNameInput");
const roomInput = document.getElementById("roomIdInput");
const createdRoomInput = document.getElementById("createdRoomId");

const startBtn = document.getElementById("startBtn");
const createBtn = document.getElementById("createBtn");
const screenBtn = document.getElementById("screenBtn");
const endBtn = document.getElementById("endBtn");

const localVideoName = document.getElementById("localVideoName");
const displayId = document.getElementById("displayMyId");

//chat messsage
const chatPanel = document.getElementById("chatPanel");
const openChatBtn = document.getElementById("openChatBtn");
const closeChatBtn = document.getElementById("closeChat");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const replyBanner = document.getElementById("replyBanner");
const replyName = document.getElementById("replyName");
const cancelReply = document.getElementById("cancelReply");
const chatBadge = document.getElementById("chatBadge");
let replyTargetId = null;
let replyTargetName = null;

function showReplyBanner(name) {
  replyBanner.classList.remove("hidden");
  replyName.innerText = name;
  handleOpenChat();
}

function hideReplyBanner() {
  replyBanner.classList.add("hidden");
  replyTargetId = null;
  replyTargetName = null;
}

cancelReply.onclick = hideReplyBanner;
const handleOpenChat = () => {
  chatPanel.classList.remove("hidden");
  chatBadge.classList.add("hidden");
};

openChatBtn.onclick = () => {
  handleOpenChat();
};

closeChatBtn.onclick = () => {
  chatPanel.classList.add("hidden");
};

sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;

  // Check if we are in "Private" mode based on your card click logic
  const isPrivate = !!replyTargetId;

  const messageData = {
    text: text,
    isPrivate: isPrivate,
    replyTo: isPrivate
      ? {
          id: replyTargetId,
          name: replyTargetName,
        }
      : null,
  };

  // Send the structured JSON string through the SDK
  sdk.sendChat(messageData);

  // Render locally for the user
  renderMessage(
    {
      sender_id: localStorage.getItem("vsdk_id"),
      sender_name: "You",
      message: JSON.stringify(messageData), // Pass same JSON structure for parsing consistency
    },
    true,
  );

  chatInput.value = "";
  hideReplyBanner();
};

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendChatBtn.click();
  }
});

function renderMessage(msg, isMe = false) {
  let messageBody = msg.message;
  let replyContext = msg.reply_to || null;
  let isPrivate = false;

  try {
    const parsed = JSON.parse(msg.message);
    messageBody = parsed.text;
    replyContext = parsed.replyTo;
    isPrivate = parsed.isPrivate;
  } catch (e) {
    // Fallback for plain text messages
  }

  const div = document.createElement("div");
  // Dynamic classes for styling
  div.className = `chat-message ${isMe ? "is-me" : ""} ${isPrivate ? "private-msg" : ""}`;

  // 1. Header: Name + Private Badge
  const header = document.createElement("div");
  header.className = "message-header";

  const nameSpan = document.createElement("span");
  nameSpan.className = "sender-name";
  nameSpan.innerText = isMe ? "You" : msg.sender_name;

  header.appendChild(nameSpan);

  if (isPrivate) {
    const badge = document.createElement("span");
    badge.className = "private-badge";
    badge.innerText = "🔒 Private";
    header.appendChild(badge);
  }
  div.appendChild(header);

  // 2. Reply Context
  if (replyContext) {
    const replyDiv = document.createElement("div");
    replyDiv.className = "replied-content";
    const label = isPrivate ? "Direct to" : "Replying to";
    replyDiv.innerHTML = `<small>${label} <b>@${replyContext.name}</b></small>`;
    div.appendChild(replyDiv);
  }

  // 3. Text content
  const textDiv = document.createElement("div");
  textDiv.className = "text";
  textDiv.innerText = messageBody;
  div.appendChild(textDiv);

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

displayId.innerText = localStorage.getItem("vsdk_id") || "Pending";

// ---------------- SDK ----------------
const sdk = new VideoSDKCore(
  "wss://rust-video-server.onrender.com/ws",
  meetingState,
  {
    onUserJoined: (participant) => {
      alert(`${participant.name || "Participant"} joined`);

      createOrUpdateCard(participant.id, participant.name);
    },

    onTrack: (peerId, kind) => {
      const participant = meetingState.getParticipant(peerId);

      if (!participant) return;

      // CAMERA
      if (kind === "camera") {
        const card = createOrUpdateCard(participant.id, participant.name);

        const video = card.querySelector("video");

        video.srcObject = participant.media.cameraStream;

        return;
      }

      // SCREEN
      if (kind === "screen") {
        screenVideo.srcObject = participant.media.screenStream;

        screenLabel.innerText = `${participant.name || peerId} is sharing screen`;

        screenStage.classList.remove("hidden");
      }
    },

    onUserLeft: (participant) => {
      alert(`${participant.name || "Participant"} left`);

      document.getElementById(`card-${participant.id}`)?.remove();
    },
    onMessage: (msg) => {
      const myId = localStorage.getItem("vsdk_id");
      const isMe = msg.sender_id === myId;
      if (document.hidden && !isMe) {
        const audio = new Audio(
          "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
        );
        audio.play();
      }
      if (!isMe) {
        renderMessage(msg, false);

        // Show indicator only if the user isn't currently looking at the chat
        if (chatPanel.classList.contains("hidden")) {
          chatBadge.classList.remove("hidden");
        }
      }
    },
  },
);

// ---------------- VIDEO CARD ----------------
function createOrUpdateCard(id, name) {
  let card = document.getElementById(`card-${id}`);

  if (!card) {
    card = document.createElement("div");
    card.className = "video-card";
    card.id = `card-${id}`;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement("div");
    label.className = "video-name";

    card.appendChild(video);
    card.appendChild(label);

    videosContainer.appendChild(card);
  }

  card.querySelector(".video-name").textContent = name || id;

  // 🔥 CLICK = SET PRIVATE TARGET
  card.onclick = () => {
    if (id === meetingState.localParticipant?.id) return;

    replyTargetId = id;
    replyTargetName = name || id;

    showReplyBanner(replyTargetName);
  };

  return card;
}

// ---------------- CREATE ROOM ----------------
createBtn.onclick = async () => {
  const res = await fetch("https://rust-video-server.onrender.com/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "My Room",
      created_by: localStorage.getItem("vsdk_id"),
    }),
  });

  const data = await res.json();

  createdRoomInput.value = data.id;

  roomInput.value = data.id;
};

// ---------------- JOIN ----------------
startBtn.onclick = async () => {
  const roomId = roomInput.value.trim();

  const name =
    userNameInput.value.trim() || `User-${displayId.textContent.slice(0, 5)}`;

  if (!roomId) {
    alert("Room ID required");
    return;
  }

  localVideoName.innerText = `${name} (You)`;

  await sdk.initLocal(localVideo, name);

  await sdk.connect(roomId, name);

  startBtn.disabled = true;
  startBtn.innerText = "Connected";

  userNameInput.disabled = true;
  roomInput.disabled = true;

  screenBtn.disabled = false;
  endBtn.disabled = false;
};

// ---------------- SCREEN SHARE ----------------
screenBtn.onclick = async () => {
  try {
    if (sdk.isScreenSharing) {
      await sdk.stopScreenShare();
      screenBtn.innerText = "Start Screen Share";
    } else {
      await sdk.startScreenShare();
      screenBtn.innerText = "Stop Screen Share";
    }
  } catch (err) {
    console.error(err);
    alert("Screen Share Failed");
  }
};

// ---------------- END ----------------
endBtn.onclick = async () => {
  try {
    if (sdk.isScreenSharing) {
      await sdk.stopScreenShare();
    }

    if (typeof sdk.disconnect === "function") {
      await sdk.disconnect();
    }

    startBtn.disabled = false;
    startBtn.innerText = "Join Call";

    userNameInput.disabled = false;
    roomInput.disabled = false;

    screenBtn.disabled = true;
    endBtn.disabled = true;

    screenVideo.srcObject = null;

    screenStage.classList.add("hidden");

    videosContainer.innerHTML = `
                    <div class="video-card">
                        <video id="localVideo" autoplay playsinline muted></video>
                        <div class="video-name" id="localVideoName">You</div>
                    </div>
                `;

    alert("Meeting Ended");
  } catch (err) {
    console.error(err);

    alert("Failed To End Meeting");
  }
};
