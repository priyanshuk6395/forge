'use strict';

const { Client } = require('ssh2');
const { decrypt, redact } = require('./crypto');

function clientFor(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectOpts = {
      host: server.host,
      port: server.sshPort || 22,
      username: server.sshUser,
      readyTimeout: 20000,
      // Forge only ever connects to boxes the user explicitly registered by
      // IP/hostname — there is no host-key pinning store yet (roadmap), so
      // this is a known trust-on-first-use gap, called out in the README.
    };
    if (server.sshKeyEnc) {
      connectOpts.privateKey = decrypt(server.sshKeyEnc);
      if (server.sshKeyPassphraseEnc) {
        connectOpts.passphrase = decrypt(server.sshKeyPassphraseEnc);
      }
    } else if (server.sshPasswordEnc) {
      connectOpts.password = decrypt(server.sshPasswordEnc);
    } else {
      return reject(new Error('Server has no SSH credentials configured.'));
    }

    conn
      .on('ready', () => resolve(conn))
      .on('error', (err) => reject(err))
      .connect(connectOpts);
  });
}

// Runs a single command over SSH. `onLine` (optional) is called with each
// chunk of stdout/stderr as it streams in, for live deployment logs.
async function exec(server, command, { onLine, timeoutMs = 15 * 60 * 1000 } = {}) {
  const conn = await clientFor(server);
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        conn.end();
        return reject(err);
      }
      stream
        .on('close', (code) => {
          clearTimeout(timer);
          conn.end();
          resolve({ code, stdout: redact(stdout), stderr: redact(stderr) });
        })
        .on('data', (data) => {
          const text = redact(data.toString('utf8'));
          stdout += text;
          if (onLine) onLine(text, 'stdout');
        })
        .stderr.on('data', (data) => {
          const text = redact(data.toString('utf8'));
          stderr += text;
          if (onLine) onLine(text, 'stderr');
        });
    });
  });
}

// Uploads in-memory content to a remote path via SFTP, with explicit perms —
// used for the per-deploy env file and the generated deploy script.
async function uploadContent(server, content, remotePath, mode = 0o600) {
  const conn = await clientFor(server);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      const stream = sftp.createWriteStream(remotePath, { mode });
      stream.on('close', () => {
        conn.end();
        resolve();
      });
      stream.on('error', (e) => {
        conn.end();
        reject(e);
      });
      stream.end(content);
    });
  });
}

async function testConnection(server) {
  const result = await exec(server, 'echo forge-ok && uname -a', { timeoutMs: 15000 });
  if (result.code !== 0) {
    throw new Error(`SSH reached the host but the test command failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

module.exports = { exec, uploadContent, testConnection };
