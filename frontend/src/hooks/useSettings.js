// settings saved in the browser (localStorage) and their defaults
import { useState } from 'react';

export const DEFAULTS = {
  greet: true,        // say hello when a known face appears
  remember: true,     // keep recent chats
  cam: true,          // camera on
  mic: true,          // microphone allowed
  faceSource: 'laptop', // camera used for faces: 'laptop' = this computer, 'robot' = the ESP32-CAM
  sync: 'both',       // website and robot: 'both' | 'web' | 'robot' | 'none'
  lookAt: 'face',     // where the head looks: 'face' = follows your face, 'mouse' = follows the mouse, 'off'
  bye: true,          // say goodbye when a known person leaves
  idle: true,         // do small fun things when it is quiet
  rate: 1, voice: '',
  aiSource: 'local',  // 'local' = this browser asks Ollama on this computer, 'server' = the server asks Ollama
  ol: 'http://localhost:11434',
  aiMode: 'auto',     // 'auto' = cloud first with the local model as backup, 'cloud' = cloud only, 'local' = local only
  cloudModel: 'gemma4:31b-cloud',
  localModel: 'llama3.1:8b',
  mode: 'wake',       // 'wake' | 'push' | 'always'
  wake: 'punte, buddy',
  away: 2             // minutes away before the same person is greeted again
};

// Settings are kept in this browser only (they are not secret).
export function useSettings() {
  const [S, setS] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('punte') || '{}') }; } catch (e) { return { ...DEFAULTS }; }
  });
  const update = patch => setS(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem('punte', JSON.stringify(next)); } catch (e) { /* private window: just do not save */ }
    return next;
  });
  return [S, update];
}
