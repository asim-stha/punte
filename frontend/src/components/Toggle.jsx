// on/off switch
export default function Toggle({ on, onChange, label }) {
  return <button className={'tg' + (on ? ' on' : '')} role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />;
}