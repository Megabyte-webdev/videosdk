import { ChatMessage, Participant, ParticipantMedia } from "./types";

export class MeetingState {
  localParticipant: Participant | null = null;

  private participants = new Map<string, Participant>();

  private activeScreenPeerId: string | null = null;
  messages: ChatMessage[] = [];

  addMessage(msg: ChatMessage) {
    this.messages.push(msg);
  }
  getMessages() {
    return this.messages;
  }

  // ---------------- PARTICIPANTS ----------------
  addParticipant(
    p: Omit<Participant, "media"> & { media?: Partial<ParticipantMedia> },
  ) {
    this.participants.set(p.id, {
      id: p.id,
      name: p.name,
      media: {
        cameraStream: null,
        screenStream: null,
        micEnabled: true,
        camEnabled: true,
        isScreenSharing: false,
        ...p.media,
      },
    });
  }

  removeParticipant(id: string) {
    this.participants.delete(id);
  }

  getParticipant(id: string) {
    return this.participants.get(id) || null;
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }

  // ---------------- MEDIA ----------------
  setCameraStream(id: string, stream: MediaStream | null) {
    const p = this.participants.get(id);
    if (!p) return;

    p.media.cameraStream = stream;
  }

  setScreenStream(id: string, stream: MediaStream | null) {
    const p = this.participants.get(id);
    if (!p) return;

    p.media.screenStream = stream;
    p.media.isScreenSharing = !!stream;
  }

  // ---------------- SCREEN CONTROL ----------------
  setActiveScreenPeer(id: string | null) {
    this.activeScreenPeerId = id;
  }

  getActiveScreenPeer() {
    return this.activeScreenPeerId;
  }

  // ---------------- RESET ----------------
  reset() {
    this.participants.clear();
    this.activeScreenPeerId = null;
    this.localParticipant = null;
    this.messages = [];
  }
}
