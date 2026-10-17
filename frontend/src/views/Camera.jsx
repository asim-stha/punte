// live picture from the ESP32-CAM on the robot body
export default function Camera({ b, S, set, hidden }) {
  const robotSource = S.faceSource === 'robot';
  return (
    <section className="view g2" hidden={hidden}>
      <div className="card">
        <h2>Robot camera</h2>
        <div className="vbox">
          <canvas className="rcam" ref={b.robotCanvasRef} width="320" height="240" />
          <div className="vph" hidden={b.robotCam}>The robot camera is offline</div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          <span className="mu">Camera</span><b>{b.robotCam ? 'Online' : 'Offline'}</b>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="mu">Seen</span><b>{b.who}</b>
        </div>
      </div>

      <div className="card">
        <h2>Which camera sees faces</h2>
        <p className="mu" style={{ marginTop: 0 }}>Face tracking, recognition and Learn face use this camera.</p>
        <label htmlFor="fs">Face camera</label>
        <select id="fs" value={S.faceSource} onChange={e => set({ faceSource: e.target.value })}>
          <option value="laptop">This computer's camera</option>
          <option value="robot">The robot camera</option>
        </select>
        {robotSource && !b.robotCam && <p className="mu" style={{ fontSize: 13 }}>The robot camera is offline, so no faces can be seen right now.</p>}
        <p className="mu" style={{ fontSize: 13 }}>The picture goes from the camera to the server and to this page. Nothing is saved. Only the face numbers of people you teach with Learn face are kept.</p>
      </div>
    </section>
  );
}
