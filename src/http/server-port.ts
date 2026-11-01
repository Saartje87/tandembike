/** The port the app serves on unless told otherwise; the MCP URL names it. */
const defaultPort = 4747;

/**
 * The port from the server's command-line arguments: `-p <port>`,
 * `--port <port>` or `--port=<port>`, else 4747. There is deliberately no
 * hostname option: the server only listens on loopback (ADR 0022). Any other
 * argument is refused, so a `-H` from the old `next` CLI scripts fails loudly
 * instead of being ignored.
 */
export function serverPort(args: readonly string[]): number {
  let port = defaultPort;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length));
    } else if (arg === '-p' || arg === '--port') {
      const value = args[++i];
      if (value === undefined) throw new Error(`${arg} needs a port.`);
      port = parsePort(value);
    } else {
      throw new Error(
        `Unknown option "${arg}". The only option is -p/--port <port>.`,
      );
    }
  }
  return port;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`"${value}" is not a valid port.`);
  }
  return port;
}
