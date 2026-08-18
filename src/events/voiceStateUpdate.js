import { Events } from 'discord.js';
import { handleVoice } from '../features/autochannel/index.js';
import { voiceJoined, voiceLeft } from '../features/levels/index.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    if (!oldState.channelId && newState.channelId) voiceJoined(newState.id);
    if (oldState.channelId && !newState.channelId) {
      voiceLeft(oldState.id, { channelSize: (oldState.channel?.members?.size ?? 0) + 1 });
    }
    await handleVoice(oldState, newState);
  },
};
