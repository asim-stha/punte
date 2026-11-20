import { FACE_CLASS } from '../lib/commands';

// The little OLED-style face. n = expression number (0 to 8).
export default function Face({ n, mini }) {
  return (
    <div className={'oled ' + (mini ? 'mini ' : '') + (FACE_CLASS[n] || '')}>
      {n === 6
        ? <><span className="hh">&#9829;</span><span className="hh">&#9829;</span></>
        : <><i className="e" /><i className="e" /></>}
    </div>
  );
}