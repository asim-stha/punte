// memory page: old chats, saved facts and known faces (can delete)
import { people } from '../lib/commands';

export default function Memory({ b, hidden }) {
  const { mem } = b;
  const list = people(b.faces);
  return (
    <section className="view g2" hidden={hidden}>
      <div className="card">
        <h2>Previous conversations</h2>
        <div className="tl">
          {mem.chat.length === 0 && <div className="empty">No conversations yet.</div>}
          {mem.chat.map((m, i) => (
            <div key={i} className="ti"><small>{m.role === 'user' ? 'You' : 'Punte'}</small><span>{m.content}</span></div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={b.clearChat}>Clear conversations</button></div>
      </div>
      <div className="card">
        <h2>Saved information</h2>
        <div className="chips">
          {mem.facts.length === 0 && <span className="empty">Nothing saved yet.</span>}
          {mem.facts.map((f, i) => (
            <span key={i} className="chip"><span>{f}</span><button className="x" aria-label="Delete" onClick={() => b.deleteFact(i)}>&#10005;</button></span>
          ))}
        </div>
        <button className="btn" onClick={() => b.addFact(prompt('What should Punte remember?'))}>+ Add information</button>

        <h2 style={{ marginTop: 24 }}>People I know</h2>
        <div>
          {list.length === 0 && <div className="empty">No faces learned yet.</div>}
          {list.map(p => (
            <div key={p.name} className="line">
              <div className="row"><span className="av">{p.name[0].toUpperCase()}</span><b>{p.name}</b></div>
              <button className="x" aria-label={'Delete ' + p.name} title="Delete this face permanently" onClick={() => b.deletePerson(p.name)}>&#10005;</button>
            </div>
          ))}
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={b.learnFace}>+ Learn a new face</button>
        <p className="mu" style={{ fontSize: 13 }}>Faces are saved only when you press "Learn face". Unknown faces are never saved.</p>
      </div>
    </section>
  );
}