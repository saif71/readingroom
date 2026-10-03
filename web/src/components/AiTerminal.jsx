import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { aiTerminalUrl } from '../api';

export default function AiTerminal({ tool }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState('Connecting…');

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 2000,
      theme: { background: '#18181b', foreground: '#e4e4e7' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    const socket = new WebSocket(aiTerminalUrl(tool.id));
    const send = (message) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const resize = () => {
      if (!hostRef.current?.clientWidth || !hostRef.current?.clientHeight) return;
      fit.fit();
      send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);
    const input = terminal.onData((data) => send({ type: 'input', data }));
    socket.addEventListener('open', () => {
      setStatus('Running');
      resize();
      terminal.focus();
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); }
      catch { return; }
      if (message.type === 'data') terminal.write(message.data);
      else if (message.type === 'error') {
        terminal.writeln(`\r\n${message.message}`);
        setStatus('Could not start');
      } else if (message.type === 'exit') {
        terminal.writeln(`\r\n[Process exited with code ${message.code}]`);
        setStatus('Exited');
      }
    });
    socket.addEventListener('close', () => setStatus((value) => value === 'Running' || value === 'Connecting…' ? 'Disconnected' : value));
    socket.addEventListener('error', () => setStatus('Connection failed'));
    return () => {
      observer.disconnect();
      input.dispose();
      socket.close();
      terminal.dispose();
    };
  }, [tool.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-700 bg-zinc-900">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-3 py-1.5 text-xs text-neutral-300">
        <span>{tool.name}</span><span aria-live="polite">{status}</span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden p-2" aria-label={`${tool.name} terminal`} />
    </div>
  );
}
