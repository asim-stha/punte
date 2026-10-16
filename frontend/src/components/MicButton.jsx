// Microphone button.
// Wake and always-listen modes: click to turn listening on or off.
// Push-to-talk mode: hold it down while you speak.
export default function MicButton({ b, S, className = 'btn pri', children }) {
  const push = S.mode === 'push';
  const live = push ? b.holding : b.listening;
  const handlers = push
    ? { onPointerDown: e => { e.preventDefault(); b.pttStart(); }, onPointerUp: b.pttStop, onPointerLeave: b.pttStop, onPointerCancel: b.pttStop }
    : { onClick: b.toggleListening };
  return (
    <button className={className + (live ? ' live' : '')} aria-label="Talk" disabled={!S.mic}
      style={{ opacity: S.mic ? 1 : 0.4, touchAction: 'none' }} {...handlers}>
      {children}
    </button>
  );
}