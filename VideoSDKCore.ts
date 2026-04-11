import { MeetingState, Participant } from "./MeetingState";

type Events = {
  onTrack?: (stream: MediaStream, peerId: string) => void;
  onUserJoined?: (p: Participant) => void;
  onUserLeft?: (id: string) => void;
};

export class VideoSDKCore {
  private ws: WebSocket | null = null;
  private peers: Record<string, RTCPeerConnection> = {};
  private initiators = new Set<string>();

  private myId: string;
  private roomId: string | null = null;

  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private isScreenSharing = false;

  constructor(
    private url: string,
    private state: MeetingState,
    private events: Events = {},
  ) {
    this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();

    localStorage.setItem("vsdk_id", this.myId);
  }

  // ---------------- LOCAL MEDIA ----------------
  async initLocal(video: HTMLVideoElement, name: string) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    video.srcObject = this.localStream;

    this.state.localParticipant = {
      id: this.myId,
      name,
    };

    this.state.localStream = this.localStream;
  }

  // ---------------- CONNECT ----------------
  async connect(roomId: string, name: string) {
    this.roomId = roomId;

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.send({
          type: "JOIN",
          room_id: roomId,
          user_id: this.myId,
          sender_name: name,
        });

        resolve();
      };

      this.ws.onmessage = async (e) => {
        await this.handle(JSON.parse(e.data));
      };

      this.ws.onerror = reject;
    });
  }

  // ---------------- SIGNAL HANDLER ----------------
  private async handle(msg: any) {
    if (msg.sender === this.myId) return;

    switch (msg.type) {
      case "EXISTING_USERS":
        for (const p of msg.participants || []) {
          if (!p?.id || p.id === this.myId) continue;

          this.state.addParticipant(p);
          this.events.onUserJoined?.(p);

          await this.createOffer(p.id);
        }
        break;

      case "USER_JOINED": {
        const p = msg.participant;

        if (!p?.id || p.id === this.myId) return;

        this.state.addParticipant(p);
        this.events.onUserJoined?.(p);
        break;
      }

      case "OFFER":
        await this.handleOffer(msg.payload, msg.sender);
        break;

      case "ANSWER": {
        const pc = this.peers[msg.sender];
        if (!pc) return;

        if (pc.signalingState !== "have-local-offer") return;

        await pc.setRemoteDescription({
          type: "answer",
          sdp: msg.payload,
        });

        break;
      }

      case "ICE":
        try {
          await this.peers[msg.sender]?.addIceCandidate(
            JSON.parse(msg.payload),
          );
        } catch (err) {
          console.warn("ICE error:", err);
        }
        break;

      case "USER_LEFT":
        this.closePeer(msg.peerId);
        this.state.removeParticipant(msg.peerId);
        this.events.onUserLeft?.(msg.peerId);
        break;
    }
  }

  // ---------------- PEER CREATION ----------------
  private createPeer(id: string) {
    if (!this.localStream) {
      throw new Error("No local stream");
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // add tracks
    this.localStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, this.localStream!);

      if (track.kind === "video") {
        (pc as any)._videoSender = sender;
      }
    });

    // incoming stream
    pc.ontrack = (e) => {
      this.state.setStream(id, e.streams[0]);
      this.events.onTrack?.(e.streams[0], id);
    };

    // ICE
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;

      this.send({
        type: "ICE",
        payload: JSON.stringify(e.candidate),
        sender: this.myId,
        target: id,
      });
    };

    return pc;
  }

  // ---------------- OFFER ----------------
  private async createOffer(id: string) {
    if (this.initiators.has(id)) return;

    this.initiators.add(id);

    if (!this.peers[id]) {
      this.peers[id] = this.createPeer(id);
    }

    const pc = this.peers[id];

    if (pc.signalingState !== "stable") return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.send({
      type: "OFFER",
      payload: offer.sdp,
      sender: this.myId,
      target: id,
    });
  }

  // ---------------- ANSWER ----------------
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
      payload: answer.sdp,
      sender: this.myId,
      target: id,
    });
  }

  // ---------------- SCREEN SHARE ----------------
  async startScreenShare() {
    if (!this.localStream) throw new Error("No local stream");

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const screenTrack = this.screenStream.getVideoTracks()[0];

    for (const pc of Object.values(this.peers)) {
      const sender = (pc as any)._videoSender;
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }
    }

    this.isScreenSharing = true;

    screenTrack.onended = () => {
      this.stopScreenShare();
    };

    await this.renegotiateAllPeers();
  }

  async stopScreenShare() {
    if (!this.localStream) return;

    const cameraTrack = this.localStream
      .getVideoTracks()
      .find((t) => t.readyState === "live");

    if (!cameraTrack) return;

    for (const pc of Object.values(this.peers)) {
      const sender = (pc as any)._videoSender;
      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }
    }

    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;

    this.isScreenSharing = false;
  }

  // force sync peers after screen change
  private async renegotiateAllPeers() {
    for (const id of Object.keys(this.peers)) {
      this.initiators.delete(id);
      await this.createOffer(id);
    }
  }

  // ---------------- CLOSE PEER ----------------
  private closePeer(id: string) {
    this.peers[id]?.close();
    delete this.peers[id];

    this.initiators.delete(id);
    this.state.removeStream(id);
  }

  // ---------------- SEND ----------------
  private send(msg: any) {
    this.ws?.send(JSON.stringify(msg));
  }
}
