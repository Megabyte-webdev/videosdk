export type Events = {
  onTrack?: (peerId: string, kind: MediaKind) => void;
  onUserJoined?: (p: Participant) => void;
  onUserLeft?: (p: Participant) => void;
  onMessage?: (msg: any) => void;
};

export type MediaKind = "camera" | "screen";

export type ParticipantMedia = {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  isScreenSharing: boolean;
};

export type ChatMessage = {
  id: string;
  sender: string;
  name: string;
  message: string;
  timestamp: string;
  target?: string | null;
  reply_to?: {
    id: string;
    name: string;
  };
};

export type Participant = {
  id: string;
  name?: string;
  media: ParticipantMedia;
};
