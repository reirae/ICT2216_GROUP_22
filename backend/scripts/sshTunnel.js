// Opens an SSH tunnel forwarding a local TCP port to the remote MySQL
// instance, so the backend can keep using DB_HOST=127.0.0.1.
//
// Reads everything from the environment (see .env.example).
// Built on ssh2 directly so individual stream errors (ECONNRESET, etc.)
// do not crash the tunnel — only catastrophic SSH-level failures do.

require('dotenv').config();
const fs = require('fs');
const net = require('net');
const { Client } = require('ssh2');

const sshConfig = {
  host: process.env.SSH_HOST,
  port: Number(process.env.SSH_PORT || 22),
  username: process.env.SSH_USER,
  ...(process.env.SSH_PRIVATE_KEY_PATH
    ? { privateKey: fs.readFileSync(process.env.SSH_PRIVATE_KEY_PATH) }
    : { password: process.env.SSH_PASSWORD }),
  keepaliveInterval: 30000,
  readyTimeout: 20000,
};

const LOCAL_PORT = Number(process.env.DB_LOCAL_PORT || 3307);
const REMOTE_HOST = process.env.DB_HOST_REMOTE || '127.0.0.1';
const REMOTE_PORT = Number(process.env.DB_REMOTE_PORT || 3306);

if (!sshConfig.host || !sshConfig.username || (!sshConfig.password && !sshConfig.privateKey)) {
  console.error('[ssh-tunnel] missing SSH_HOST / SSH_USER / credentials in env.');
  process.exit(1);
}

const ssh = new Client();

ssh.on('ready', () => {
  console.log(`[ssh-tunnel] SSH connection ready (${sshConfig.username}@${sshConfig.host}:${sshConfig.port})`);

  const server = net.createServer((socket) => {
    socket.on('error', (err) => console.warn('[ssh-tunnel] client socket:', err.code || err.message));

    ssh.forwardOut(
      socket.remoteAddress || '127.0.0.1',
      socket.remotePort || 0,
      REMOTE_HOST,
      REMOTE_PORT,
      (err, stream) => {
        if (err) {
          console.warn('[ssh-tunnel] forwardOut failed:', err.message);
          socket.end();
          return;
        }
        stream.on('error', (e) => console.warn('[ssh-tunnel] stream:', e.code || e.message));
        socket.pipe(stream).pipe(socket);
      }
    );
  });

  server.on('error', (err) => console.error('[ssh-tunnel] server error:', err.message));
  server.listen(LOCAL_PORT, '127.0.0.1', () => {
    console.log(`[ssh-tunnel] forwarding 127.0.0.1:${LOCAL_PORT} -> ${REMOTE_HOST}:${REMOTE_PORT}`);
  });

  const cleanup = () => {
    server.close(() => ssh.end());
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
});

ssh.on('error', (err) => {
  console.error('[ssh-tunnel] SSH error:', err.message);
  process.exit(1);
});

ssh.on('end', () => console.log('[ssh-tunnel] SSH connection ended'));
ssh.on('close', () => {
  console.log('[ssh-tunnel] SSH connection closed');
  process.exit(0);
});

ssh.connect(sshConfig);
