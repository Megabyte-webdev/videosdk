export type Participant = {
  id: string;
  name: string;
  sessionId?: string;
  joinedAt?: number;
  lastSeen?: number;
  leftAt?: number;
};

export type ParticipantMedia = {
  cameraStream?: MediaStream;
  screenStream?: MediaStream;
};

export class MeetingState {
  participants = new Map<string, Participant>();
  media = new Map<string, ParticipantMedia>();

  localParticipant: Participant | null = null;
  localStream: MediaStream | null = null;

  // ---------------- PARTICIPANTS ----------------
  addParticipant(p: Participant) {
    const existing = this.participants.get(p.id);

    if (existing?.sessionId === p.sessionId) return false;

    this.participants.set(p.id, {
      ...existing,
      ...p,
    });

    return true;
  }

  removeParticipant(id: string) {
    this.participants.delete(id);
    this.media.delete(id);
  }

  getParticipants() {
    return Array.from(this.participants.values());
  }
  getParticipant(id: string) {
    return this.participants.get(id);
  }
  // ---------------- SAFE MEDIA SETTERS ----------------
  setCameraStream(id: string, stream: MediaStream) {
    const existing = this.media.get(id) || {};
    this.media.set(id, { ...existing, cameraStream: stream });
  }

  setScreenStream(id: string, stream: MediaStream | null) {
    const existing = this.media.get(id) || {};
    this.media.set(id, { ...existing, screenStream: stream || undefined });
  }

  getMedia(id: string) {
    return this.media.get(id) || null;
  }

  getCameraStream(id: string) {
    return this.media.get(id)?.cameraStream || null;
  }

  getScreenStream(id: string) {
    return this.media.get(id)?.screenStream || null;
  }

  removeMedia(id: string) {
    this.media.delete(id);
  }

  reset() {
    this.participants.clear();
    this.media.clear();
    this.localParticipant = null;
    this.localStream = null;
  }
}
