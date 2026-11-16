// Says which AI answered last. It is shown on the Chat screen and in Settings.
export default function AiStatus({ S, b }) {
  let note = 'No answer yet.';
  if (b.ai.active === 'device') note = 'Last answer: this computer (' + S.localModel + ')';
  if (b.ai.active === 'server') note = 'Last answer: the server (' + (b.info.model || 'Ollama') + ')';
  return <div className="mu" style={{ fontSize: 13, margin: '6px 0 14px' }}>{note}</div>;
}
