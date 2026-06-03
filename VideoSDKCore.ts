import { MeetingState } from "./MeetingState";
import { Events, Participant } from "./types";

export class VideoSDKCore {
  private ws: WebSocket | null = null;
  private peers: Record<string, RTCPeerConnection> = {};

  private myId: string;
  private roomId: string | null = null;

  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  public isScreenSharing: boolean = false;
  private pingInterval: any = null;
  constructor(
    private url: string,
    private state: MeetingState,
    private events: Events = {},
  ) {
    this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();

    localStorage.setItem("vsdk_id", this.myId);
  }

  // ---------------- LOCAL INIT ----------------
  async initLocal(video: HTMLVideoElement, name: string) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    video.srcObject = this.localStream;

    this.state.localParticipant = {
      id: this.myId,
      name,
      media: {
        cameraStream: this.localStream,
        screenStream: null,
        micEnabled: true,
        camEnabled: true,
        isScreenSharing: false,
      },
    };
  }

  // ---------------- CONNECT ----------------
  async connect(roomId: string, name: string) {
    this.roomId = roomId;

    this.reset();

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.send({
          type: "JOIN",
          room_id: roomId,
          user_id: this.myId,
          sender_name: name,
        });

        this.startHeartbeat();
        resolve();
      };

      this.ws.onerror = reject;

      this.ws.onmessage = (e) => this.handle(JSON.parse(e.data));
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      this.send({
        type: "PING",
        client_ts: Date.now(),
      });
    }, 20000); // every 20s
  }
  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ---------------- RESET ----------------
  private reset() {
    Object.values(this.peers).forEach((pc) => pc.close());

    this.peers = {};

    this.state.reset();
  }

  // ---------------- SIGNAL HANDLER ----------------
  private async handle(msg: any) {
    if (msg.sender === this.myId) return;

    switch (msg.type) {
      case "EXISTING_USERS":
        for (const p of msg.participants || []) {
          this.addParticipant(p);

          await this.createOffer(p.id);
        }
        break;

      case "USER_JOINED":
        this.addParticipant(msg.participant);
        break;

      case "USER_LEFT":
        this.handleUserLeft(msg.participant);
        break;

      case "OFFER":
        await this.handleOffer(msg.payload, msg.sender);
        break;

      case "ANSWER":
        await this.handleAnswer(msg);
        break;

      case "ICE":
        await this.handleIce(msg);
        break;

      case "CHAT_MESSAGE": {
        let newMsg = msg.data;
        this.state.addMessage({
          id: newMsg.id,
          sender: newMsg.sender_id,
          name: newMsg.sender_name,
          message: newMsg.message,
          timestamp: newMsg.timestamp,
          target: newMsg.target,
        });

        this.events.onMessage?.(newMsg);

        break;
      }

      case "SCREEN_SHARE_START": {
        const p = this.state.getParticipant(msg.sender);

        if (p) {
          p.media.isScreenSharing = true;
        }

        break;
      }

      case "SCREEN_SHARE_STOP": {
        const p = this.state.getParticipant(msg.sender);

        if (p) {
          p.media.isScreenSharing = false;
        }

        break;
      }
    }
  }

  // ---------------- PEER ----------------
  private createPeer(id: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // add local tracks
    this.localStream?.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    // ---------------- ON TRACK ----------------
    pc.ontrack = (event) => {
      console.log("Track", event);

      const stream = event.streams[0];

      const participant = this.state.getParticipant(id);

      if (!participant) return;

      if (participant.media.isScreenSharing) {
        this.state.setScreenStream(id, stream);

        this.events.onTrack?.(id, "screen");

        return;
      }

      this.state.setCameraStream(id, stream);

      this.events.onTrack?.(id, "camera");
    };

    // ICE
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;

      this.send({
        type: "ICE",
        sender: this.myId,
        target: id,
        payload: JSON.stringify(e.candidate),
      });
    };

    return pc;
  }

  // ---------------- OFFER ----------------
  private async createOffer(id: string) {
    if (!this.peers[id]) {
      this.peers[id] = this.createPeer(id);
    }

    const pc = this.peers[id];

    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    this.send({
      type: "OFFER",
      sender: this.myId,
      target: id,
      payload: offer.sdp,
    });
  }

  private async handleOffer(sdp: string, id: string) {
    if (!this.peers[id]) {
      this.peers[id] = this.createPeer(id);
    }

    const pc = this.peers[id];

    await pc.setRemoteDescription({
      type: "offer",
      sdp,
    });

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);

    this.send({
      type: "ANSWER",
      sender: this.myId,
      target: id,
      payload: answer.sdp,
    });
  }

  private async handleAnswer(msg: any) {
    const pc = this.peers[msg.sender];

    if (!pc) return;

    await pc.setRemoteDescription({
      type: "answer",
      sdp: msg.payload,
    });
  }

  private async handleIce(msg: any) {
    await this.peers[msg.sender]?.addIceCandidate(JSON.parse(msg.payload));
  }

  // ---------------- SCREEN SHARE ----------------
  async startScreenShare() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const track = this.screenStream.getVideoTracks()[0];

    this.isScreenSharing = true;

    if (this.state.localParticipant) {
      this.state.localParticipant.media.screenStream = this.screenStream;

      this.state.localParticipant.media.isScreenSharing = true;
    }

    // replace camera track (PROPER WAY)
    for (const id in this.peers) {
      const pc = this.peers[id];

      const sender = pc.getSenders().find((s) => s.track?.kind === "video");

      await sender?.replaceTrack(track);
    }

    this.send({
      type: "SCREEN_SHARE_START",
      sender: this.myId,
    });

    track.onended = () => this.stopScreenShare();
  }

  async stopScreenShare() {
    this.screenStream?.getTracks().forEach((t) => t.stop());

    this.screenStream = null;

    this.isScreenSharing = false;

    if (this.state.localParticipant) {
      this.state.localParticipant.media.screenStream = null;

      this.state.localParticipant.media.isScreenSharing = false;
    }

    const camTrack = this.localStream?.getVideoTracks()[0];

    if (camTrack) {
      for (const id in this.peers) {
        const pc = this.peers[id];

        const sender = pc.getSenders().find((s) => s.track?.kind === "video");

        await sender?.replaceTrack(camTrack);
      }
    }

    this.send({
      type: "SCREEN_SHARE_STOP",
      sender: this.myId,
    });
  }

  // ---------------- HELPERS ----------------
  private addParticipant(p: any) {
    this.state.addParticipant({
      id: p.id,
      name: p.name,
    });

    this.events.onUserJoined?.(this.state.getParticipant(p.id)!);
  }

  private handleUserLeft(p: Participant) {
    this.peers[p.id]?.close();

    delete this.peers[p.id];

    this.state.removeParticipant(p.id);

    this.events.onUserLeft?.(p);
  }

  private send(msg: any) {
    this.ws?.send(JSON.stringify(msg));
  }

  sendChat(payload: {
    message: string;
    reply_to: { id: string; name: string };
    target: string | null;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WS not connected");
      return;
    }

    const isPrivate = !!payload?.target;

    if (!this.roomId) {
      console.warn("No roomId set");
      return;
    }

    const senderName = this.state.localParticipant?.name || "Anonymous";

    this.send({
      type: "CHAT_MESSAGE",
      message: payload?.message?.trim(),
      user_id: this.myId,
      sender_name: senderName,
      room_id: this.roomId,
      target: isPrivate ? payload?.reply_to?.id : null,
      reply_to: payload?.reply_to || null,
      client_ts: Date.now(),
    });
  }

  private cleanupLocal() {
    Object.values(this.peers).forEach((pc) => pc.close());
    this.peers = {};

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());

    this.localStream = null;
    this.screenStream = null;

    this.state.reset();
  }

  async toggleMic() {
    if (!this.localStream) return false;

    const audioTrack = this.localStream.getAudioTracks()[0];

    if (!audioTrack) return false;

    audioTrack.enabled = !audioTrack.enabled;

    if (this.state.localParticipant) {
      this.state.localParticipant.media.micEnabled = audioTrack.enabled;
    }

    return audioTrack.enabled;
  }

  async toggleCamera() {
    if (!this.localStream) return false;

    const videoTrack = this.localStream.getVideoTracks()[0];

    if (!videoTrack) return false;

    videoTrack.enabled = !videoTrack.enabled;

    if (this.state.localParticipant) {
      this.state.localParticipant.media.camEnabled = videoTrack.enabled;
    }

    return videoTrack.enabled;
  }

  isMicEnabled() {
    return this.localStream?.getAudioTracks()[0]?.enabled ?? false;
  }

  isCameraEnabled() {
    return this.localStream?.getVideoTracks()[0]?.enabled ?? false;
  }

  disconnect() {
    if (!this.ws) return;

    this.send({
      type: "LEAVE",
      sender: this.myId,
      room_id: this.roomId,
    });

    // close socket AFTER notifying server
    this.stopHeartbeat();
    this.ws.close();

    this.ws = null;

    this.cleanupLocal();
  }
}
