// home page: camera, who punte sees and the status of robot, ai and storage
import Face from '../components/Face';
import MicButton from '../components/MicButton';

const modelText = (S, b) => {
  if (S.aiSource !== 'local') return b.info.model;
  if (S.aiMode === 'cloud') return S.cloudModel;
  if (S.aiMode === 'local') return S.localModel;
  return S.cloudModel + ' (backup: ' + S.localModel + ')';
};

export default function Home({ b, S, hidden }) {
  return (
    <section className="view g2" hidden={hidden}>
      <div className="card hero span">
        <div>
          <div className="kick">AI desktop buddy</div>
          <div className="h1">Hi, I'm <span className="gt">Punte</span></div>
          <p className="mu" style={{ margin: 0, maxWidth: 440 }}>I can see you, talk with you and remember what matters. Press Connect to start the camera.</p>
          <div className="row" style={{ marginTop: 20, flexWrap: 'wrap' }}>
            <MicButton b={b} S={S}>&#127908; {S.mode === 'push' ? 'Hold to talk' : 'Talk'}</MicButton>
            <button className="btn" onClick={b.learnFace}>Learn face</button>
          </div>
          <div className="statusline"><span className="mu">Punte status</span><b>{b.badge}</b></div>
        </div>
        <Face n={b.face} />
      </div>

      <div className="card">
        <h2>Camera</h2>
        <div className="vbox">
          <video ref={b.videoRef} autoPlay muted playsInline />
          <div className="vph" hidden={b.cam.on}>{b.cam.note}</div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}><span className="mu">Seen</span><b>{b.who}</b></div>
      </div>

      <div className="card">
        <h2>At a glance</h2>
        <div className="stats">
          <div className="st"><b>{new Set(b.faces.map(f => f.n)).size}</b><span>People I know</span></div>
          <div className="st"><b>{b.mem.facts.length}</b><span>Things I remember</span></div>
          <div className="st"><b>{b.mem.chat.length}</b><span>Recent messages</span></div>
        </div>
        <div className="line"><span className="mu">Robot</span><b>{b.robot === null ? '-' : b.robot ? 'Online' : 'Offline'}</b></div>
        <div className="line"><span className="mu">AI</span><b>{S.aiSource === 'local' ? 'This computer' : 'Server'}</b></div>
        <div className="line"><span className="mu">AI model</span><b>{modelText(S, b)}</b></div>
      </div>
    </section>
  );
}