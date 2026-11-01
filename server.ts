import next from 'next';

import { isLoopbackAddress } from './src/http/loopback-address';
import { serverPort } from './src/http/server-port';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer, type Socket } from 'node:net';

/**
 * Serves the app for `npm run dev` and `npm run start`, in place of the `next`
 * CLI, so it can only be reached from this machine (ADR 0022): it listens on
 * the loopback addresses alone, takes no hostname option, and refuses any
 * connection from another address.
 */

const loopbackAddresses = ['127.0.0.1', '::1'];

const refusal = 'Tandembike only accepts connections from this machine.\n';
const refusalResponse = [
  'HTTP/1.1 403 Forbidden',
  'Content-Type: text/plain; charset=utf-8',
  `Content-Length: ${Buffer.byteLength(refusal)}`,
  'Connection: close',
  '',
  refusal,
].join('\r\n');

async function main(): Promise<void> {
  let port: number;
  try {
    port = serverPort(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  const dev = process.env.NODE_ENV !== 'production';
  // One HTTP server, fed by a listener per loopback address: Next attaches its
  // upgrade handler (HMR) to the server it is given, and a server listens once.
  const httpServer = createHttpServer();
  const app = next({ dev, hostname: 'localhost', port, httpServer });
  const handle = app.getRequestHandler();
  await app.prepare();
  httpServer.on('request', (req, res) => {
    handle(req, res);
  });

  const accept = (socket: Socket) => {
    // Never expected while listening on loopback only; a second line of
    // defence. Checked on the connection, so it covers upgrades too.
    if (!isLoopbackAddress(socket.remoteAddress)) {
      console.warn(
        `Refused a connection from ${socket.remoteAddress}: Tandembike only accepts connections from this machine.`,
      );
      socket.end(refusalResponse);
      return;
    }
    httpServer.emit('connection', socket);
  };

  const listening = await Promise.all(
    loopbackAddresses.map((address) => listen(accept, address, port)),
  );
  const bound = loopbackAddresses.filter((_, i) => listening[i]);
  if (bound.length === 0) {
    console.error('Could not listen on any loopback address.');
    process.exit(1);
  }
  console.log(
    `> Tandembike ${dev ? 'development' : 'production'} server at http://localhost:${port} (listening on ${bound.join(', ')})`,
  );

  const shutdown = () => {
    app.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/**
 * Listens on one loopback address. A port in use stops the server, since the
 * MCP URL is fixed; an address this machine lacks (IPv6 turned off) is skipped.
 */
function listen(
  accept: (socket: Socket) => void,
  address: string,
  port: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer(accept);
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT') {
        console.warn(`Skipping ${address}: ${error.code}.`);
        resolve(false);
        return;
      }
      console.error(
        `Could not listen on ${address}:${port}: ${error.code ?? error.message}`,
      );
      process.exit(1);
    });
    server.listen({ host: address, port, ipv6Only: true }, () => resolve(true));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
