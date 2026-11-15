// Robot mode: the middle of the room shows what the real robot sees and how it is doing
export default function RobotView({ b, S }) {
  const state = b.robot === null ? 'Checking...' : b.robot ? 'Online' : 'Offline';
  return (
    <>
      <div className="stage" />
      <div className="robotview">
        <div className="rv-cam">
          <canvas className="rv-canvas" ref={b.robotCanvasRef} width="320" height="240" aria-label="Picture from the robot camera" />
          <span className="live"><i />Robot camera</span>
          <p className="rv-off" hidden={b.robotCam}>
            {b.robot === false ? 'The robot is offline. Switch it on and wait a few seconds.' : 'The robot camera is offline.'}
          </p>
        </div>
        <div className="rv-row">
          <div className="rv-card"><small>Robot</small><b>{state}</b></div>
          <div className="rv-card"><small>Listening with</small><b>Robot microphone</b>{!b.info.ears && <small>The listening engine is off on the server</small>}</div>
          <div className="rv-card"><small>Talking with</small><b>{b.info.voice && b.robot ? 'Robot speaker' : 'This computer'}</b>{!(b.info.voice && b.robot) && <small>The robot cannot speak right now</small>}</div>
          <div className="rv-card"><small>Last event</small><b>{b.lastEv ? b.lastEv.text.replace('Punte ', '') : 'Nothing yet'}</b></div>
          <div className="rv-card"><small>Seen</small><b>{b.who}</b></div>
        </div>
      </div>
    </>
  );
}
