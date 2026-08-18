import { Events } from 'discord.js';
import { handleVoice } from '../features/autochannel/index.js';

export default {
  name: Events.VoiceStateUpdate,
  execute: (oldState, newState) => handleVoice(oldState, newState),
};
