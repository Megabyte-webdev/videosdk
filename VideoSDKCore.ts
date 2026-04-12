import { MeetingState, Participant } from "./MeetingState";

type Events = {
  onTrack?: (peerId: string) => void;
  onUserJoined?: (p: Participant) => void;
  onUserLeft?: (id: string) => void;

  onScreenShareStart?: (peerId: string) => void;
  onScreenShareStop?: (peerId: string) => void;
};

export class VideoSDKCore {
  private ws: WebSocket | null = null;

  private peers: Record<string, RTCPeerConnection> = {};
  private initiators = new Set<string>();

  private myId: string;
  private roomId: string | null = null;

  private sessionId: string | null = null;

  private localStream: MediaStream | null = null;

  private screenStream: MediaStream | null = null;
  private isScreenSharing = false;

  private screenSenders: Record<string, RTCRtpSender> = {};

  private notify(type: string) {
    this.send({
      type,
      room_id: this.roomId,
      user_id: this.myId,
    });
  }

  constructor(
    private url: string,
    private state: MeetingState,
    private events: Events = {},
  ) {
    this.myId = localStorage.getItem("vsdk_id") || crypto.randomUUID();
    localStorage.setItem("vsdk_id", this.myId);
  }

  async initLocal(video: HTMLVideoElement, name: string) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    video.srcObject = this.localStream;

    this.state.localStream = this.localStream;

    this.state.localParticipant = {
      id: this.myId,
      name,
    };
  }

  async connect(roomId: string, name: string) {
    this.roomId = roomId;

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
    }

    this.peers = {};
    this.initiators.clear();
    this.state.reset(); // IMPORTANT: you DO have this

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

      this.ws.onerror = (err) => {
        reject(err);
      };

      this.ws.onmessage = async (e) => {
        await this.handle(JSON.parse(e.data));
      };

      this.ws.onclose = () => {
        console.warn("WebSocket closed");
      };
    });
  }

  private async handle(msg: any) {
    console.log("HANDLE MSG:", msg);

    if (msg.sender === this.myId) {
      console.log("Ignoring self message");
      return;
    }

    switch (msg.type) {
      case "EXISTING_USERS":
        for (const p of msg.participants || []) {
          if (!p?.id || p.id === this.myId) continue;

          // prevent duplicate state
          if (this.state.getParticipant?.(p.id)) continue;

          this.state.addParticipant({
            id: p.id,
            name: p.name,
            sessionId: p.session_id,
          });

          this.events.onUserJoined?.({
            id: p.id,
            name: p.name,
            sessionId: p.session_id,
          });

          await this.createOffer(p.id);
        }
        break;

      case "USER_JOINED": {
        const p = msg.participant;
        if (!p?.id || p.id === this.myId) return;

        this.state.addParticipant({
          id: p.id,
          name: p.name,
          sessionId: p.session_id,
        });

        this.events.onUserJoined?.({
          id: p.id,
          name: p.name,
          sessionId: p.session_id,
        });

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
        } catch (e) {
          console.warn("ICE error", e);
        }
        break;

      case "USER_LEFT": {
        const p = msg.participant;
        if (!p?.id) return;

        this.closePeer(p.id);
        this.state.removeParticipant(p.id);
        this.events.onUserLeft?.(p);
        break;
      }

      case "SCREEN_SHARE_START":
        this.events.onScreenShareStart?.(msg.peerId);
        break;

      case "SCREEN_SHARE_STOP":
        this.state.setScreenStream(msg.peerId, null);
        this.events.onScreenShareStop?.(msg.peerId);
        break;

      case "PEER_REJOINED":
        this.closePeer(msg.peerId);

        this.initiators.delete(msg.peerId);

        await this.createOffer(msg.peerId);
        break;
    }
  }

  private createPeer(id: string) {
    if (!this.localStream) throw new Error("No local stream");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    if (this.screenStream) {
      const track = this.screenStream.getVideoTracks()[0];
      if (track) {
        pc.addTrack(track, this.screenStream);
      }
    }

    pc.ontrack = (event) => {
      console.log(event);

      const stream = event.streams[0] || new MediaStream([event.track]);

      const track = event.track;

      const isScreen =
        track.kind === "video" && track.label.toLowerCase().includes("screen");

      if (isScreen) {
        this.state.setScreenStream(id, stream);
      } else if (track.kind === "video") {
        this.state.setCameraStream(id, stream);
      }

      this.events.onTrack?.(id);
    };

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

  private async handleOffer(sdp: string, id: string) {
    console.log("HANDLE OFFER FROM:", id);

    if (!this.peers[id]) {
      console.log("Creating peer because none exists");
      this.peers[id] = this.createPeer(id);
    }

    const pc = this.peers[id];

    console.log("Setting remote description...");
    await pc.setRemoteDescription({ type: "offer", sdp });

    console.log("Creating answer...");
    const answer = await pc.createAnswer();

    console.log("Setting local answer...");
    await pc.setLocalDescription(answer);

    console.log("Sending ANSWER");

    this.send({
      type: "ANSWER",
      payload: answer.sdp,
      sender: this.myId,
      target: id,
    });
  }

  async startScreenShare() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    const track = this.screenStream.getVideoTracks()[0];

    for (const pc of Object.values(this.peers)) {
      pc.addTrack(track, this.screenStream);
    }

    this.isScreenSharing = true;

    this.notify("SCREEN_SHARE_START");

    track.onended = () => this.stopScreenShare();

    await this.renegotiate();
  }

  async stopScreenShare() {
    for (const pc of Object.values(this.peers)) {
      const senders = pc.getSenders();

      for (const sender of senders) {
        if (sender.track?.id === this.screenStream?.getVideoTracks()[0]?.id) {
          pc.removeTrack(sender);
        }
      }
    }

    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;

    this.isScreenSharing = false;

    this.state.media.forEach((m, id) => {
      this.state.setScreenStream(id, null);
    });

    this.notify("SCREEN_SHARE_STOP");

    await this.renegotiate();
  }

  private async renegotiate() {
    for (const id of Object.keys(this.peers)) {
      this.initiators.delete(id);
      await this.createOffer(id);
    }
  }

  private closePeer(id: string) {
    this.peers[id]?.close();
    delete this.peers[id];
    this.initiators.delete(id);
    this.state.removeMedia(id);
  }

  private send(msg: any) {
    this.ws?.send(JSON.stringify(msg));
  }
}
