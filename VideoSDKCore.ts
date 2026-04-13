import { MeetingState, Participant } from "./MeetingState";

type MediaKind = "camera" | "screen";

type Events = {
  onTrack?: (peerId: string, kind: MediaKind) => void;
  onUserJoined?: (p: Participant) => void;
  onUserLeft?: (p: Participant) => void;
  onScreenShareStart?: (peerId: string) => void;
  onScreenShareStop?: (peerId: string) => void;
};

export class VideoSDKCore {
  private ws: WebSocket | null = null;
  private peers: Record<string, RTCPeerConnection> = {};

  private screenSenders: Record<string, RTCRtpSender> = {};
  private offerLocks = new Set<string>();

  private myId: string;
  private roomId: string | null = null;

  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  public isScreenSharing = false;

  constructor(
    private url: string,
    private state: MeetingState,
    private events: Events = {},
  ) {
    this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
    localStorage.setItem("vsdk_id", this.myId);
  }

  // ---------------- LOCAL ----------------
  async initLocal(video: HTMLVideoElement, name: string) {
    console.log("[SDK] init local");

    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    video.srcObject = this.localStream;

    this.state.localStream = this.localStream;
    this.state.localParticipant = { id: this.myId, name };
  }

  // ---------------- CONNECT ----------------
  async connect(roomId: string, name: string) {
    this.roomId = roomId;
    this.reset();

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("[SDK] connected");

        this.send({
          type: "JOIN",
          room_id: roomId,
          user_id: this.myId,
          sender_name: name,
        });

        resolve();
      };

      this.ws.onerror = reject;
      this.ws.onmessage = (e) => this.handle(JSON.parse(e.data));
    });
  }

  // ---------------- RESET ----------------
  private reset() {
    Object.values(this.peers).forEach((p) => p.close());
    this.peers = {};
    this.screenSenders = {};
    this.offerLocks.clear();
    this.state.reset();
  }

  // ---------------- HANDLE ----------------
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
        if (msg.participant) this.handleUserLeft(msg.participant);
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

      // ---------------- SCREEN ----------------
      case "SCREEN_SHARE_START": {
        const peerId = msg.peerId;

        console.log("[SDK] 🖥 SCREEN START", peerId);

        this.state.setMediaMode(peerId, "screen");
        this.state.setActiveScreenPeer(peerId);

        this.events.onScreenShareStart?.(peerId);
        break;
      }

      case "SCREEN_SHARE_STOP": {
        const peerId = msg.peerId;

        console.log("[SDK] 📴 SCREEN STOP", peerId);

        this.state.setMediaMode(peerId, "camera");
        this.state.setActiveScreenPeer(null);
        this.state.setScreenStream(peerId, null);

        this.events.onScreenShareStop?.(peerId);
        break;
      }
    }
  }

  // ---------------- PEER ----------------
  private createPeer(id: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // CAMERA ONLY
    this.localStream?.getTracks().forEach((t) => {
      pc.addTrack(t, this.localStream!);
    });

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const peerId = id;

      const activeScreen = this.state.getActiveScreenPeer();

      console.log("[SDK] 🎬 ontrack", peerId);

      // ---------------- SCREEN ----------------
      if (activeScreen === peerId) {
        console.log("[SDK] 🖥 SCREEN STREAM RECEIVED", peerId);

        this.events.onTrack?.(peerId, "screen");
        return;
      }

      // ---------------- CAMERA ----------------
      if (this.state.getActiveScreenPeer() === peerId) {
        console.log("[SDK] 🚫 ignoring camera (screen active)");
        return;
      }

      console.log("[SDK] 🎥 CAMERA STREAM RECEIVED", peerId);

      this.state.setCameraStream(peerId, stream);
      this.events.onTrack?.(peerId, "camera");
    };

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
    if (this.offerLocks.has(id)) return;
    this.offerLocks.add(id);

    try {
      if (!this.peers[id]) this.peers[id] = this.createPeer(id);

      const pc = this.peers[id];
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.send({
        type: "OFFER",
        sender: this.myId,
        target: id,
        payload: offer.sdp,
      });
    } finally {
      this.offerLocks.delete(id);
    }
  }

  private async handleOffer(sdp: string, id: string) {
    if (!this.peers[id]) this.peers[id] = this.createPeer(id);

    const pc = this.peers[id];

    await pc.setRemoteDescription({ type: "offer", sdp });

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

  // ---------------- USER LEFT ----------------
  private handleUserLeft(p: Participant) {
    this.peers[p.id]?.close();
    delete this.peers[p.id];

    this.state.removeParticipant(p.id);
    this.state.setCameraStream(p.id, null);
    this.state.setScreenStream(p.id, null);

    this.events.onUserLeft?.(p);
  }

  // ---------------- SCREEN SHARE ----------------
  async startScreenShare() {
    console.log("[SDK] startScreenShare");

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const track = this.screenStream.getVideoTracks()[0];

    this.isScreenSharing = true;

    // IMPORTANT: set active screen IMMEDIATELY
    this.state.setActiveScreenPeer(this.myId);
    this.state.setScreenStream(this.myId, this.screenStream);

    for (const [id, pc] of Object.entries(this.peers)) {
      const sender = this.screenSenders[id];

      if (sender) sender.replaceTrack(track);
      else this.screenSenders[id] = pc.addTrack(track, this.screenStream);

      await this.reoffer(id);
    }

    this.send({
      type: "SCREEN_SHARE_START",
      sender: this.myId,
      room_id: this.roomId,
      peerId: this.myId,
    });

    track.onended = () => this.stopScreenShare();
  }
  async stopScreenShare() {
    console.log("[SDK] stopScreenShare");

    this.state.setActiveScreenPeer(null);

    for (const [id, pc] of Object.entries(this.peers)) {
      const sender = this.screenSenders[id];
      if (sender) pc.removeTrack(sender);
    }

    this.screenSenders = {};
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.isScreenSharing = false;

    this.send({
      type: "SCREEN_SHARE_STOP",
      sender: this.myId,
      room_id: this.roomId,
      peerId: this.myId,
    });
  }

  private async reoffer(id: string) {
    const pc = this.peers[id];
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.send({
      type: "OFFER",
      sender: this.myId,
      target: id,
      payload: offer.sdp,
    });
  }

  // ---------------- HELPERS ----------------
  private addParticipant(p: any) {
    this.state.addParticipant({ id: p.id, name: p.name });
    this.events.onUserJoined?.(p);
  }

  private send(msg: any) {
    this.ws?.send(JSON.stringify(msg));
  }
}
