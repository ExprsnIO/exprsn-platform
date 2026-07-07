/**
 * BUG-002 DoS guards — ws payload bounds + subscribeLabels cursor validation.
 *
 * `ws` is mocked so we can assert on constructor options (maxPayload) and drive
 * the subscribeLabels 'connection' handler directly with a fake socket.
 */
jest.mock('ws', () => {
  const WebSocket = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  }));
  WebSocket.WebSocketServer = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
    handleUpgrade: jest.fn(),
  }));
  WebSocket.Server = WebSocket.WebSocketServer;
  return WebSocket;
});

const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;
const config = require('../config');
const { LabelerConsumer, SUBSCRIBE_PATH } = require('../src/ingest/labelConsumer');
const { createSubscribeLabelsServer, SUBSCRIBE_LABELS_PATH } = require('../src/xrpc/subscribeLabels');

function fakeModels() {
  return {
    ExternalLabeler: {
      update: jest.fn().mockResolvedValue([1]),
      findByPk: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue([{}]),
    },
    Label: { findAll: jest.fn().mockResolvedValue([]) },
  };
}

function fakeClientWs() {
  return { on: jest.fn(), close: jest.fn(), send: jest.fn(), readyState: 1, OPEN: 1 };
}

/** Build a server, then invoke its 'connection' handler with a fake socket. */
async function connect(models, reqUrl) {
  createSubscribeLabelsServer(models);
  const wss = WebSocketServer.mock.results[WebSocketServer.mock.results.length - 1].value;
  const handler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
  const ws = fakeClientWs();
  await handler(ws, { url: reqUrl });
  // Detach the labelBus listener the handler registered (as a real close would).
  const closeCb = (ws.on.mock.calls.find((c) => c[0] === 'close') || [])[1];
  if (closeCb) closeCb();
  return ws;
}

beforeEach(() => {
  WebSocket.mockClear();
  WebSocketServer.mockClear();
});

describe('labelConsumer ws client maxPayload (BUG-002)', () => {
  test('connects with a bounded maxPayload from config', () => {
    const consumer = new LabelerConsumer(fakeModels(), {
      endpoint: `wss://peer.example${SUBSCRIBE_PATH}`,
      did: null,
    });
    consumer._connect();
    expect(WebSocket).toHaveBeenCalledTimes(1);
    const [url, opts] = WebSocket.mock.calls[0];
    expect(url).toBe(`wss://peer.example${SUBSCRIBE_PATH}`);
    expect(opts).toEqual(expect.objectContaining({ maxPayload: config.limits.labelWsMaxPayload }));
    expect(config.limits.labelWsMaxPayload).toBeGreaterThan(0);
    consumer.stop();
  });
});

describe('subscribeLabels server guards (BUG-002)', () => {
  test('WebSocketServer is created with a bounded maxPayload', () => {
    createSubscribeLabelsServer(fakeModels());
    expect(WebSocketServer).toHaveBeenCalledWith(
      expect.objectContaining({ noServer: true, maxPayload: config.limits.labelWsMaxPayload })
    );
  });

  test('non-numeric cursor is rejected cleanly — no BigInt crash, no query', async () => {
    const models = fakeModels();
    const ws = await connect(models, `${SUBSCRIBE_LABELS_PATH}?cursor=abc`);
    expect(ws.close).toHaveBeenCalledWith(1008, 'invalid_cursor');
    expect(models.Label.findAll).not.toHaveBeenCalled();
  });

  test('negative / garbage cursors are also rejected', async () => {
    for (const bad of ['-5', '1e3', '12abc', '%00']) {
      // eslint-disable-next-line no-await-in-loop
      const ws = await connect(fakeModels(), `${SUBSCRIBE_LABELS_PATH}?cursor=${bad}`);
      expect(ws.close).toHaveBeenCalledWith(1008, 'invalid_cursor');
    }
  });

  test('a valid numeric cursor still backfills (guard is not over-broad)', async () => {
    const models = fakeModels();
    const ws = await connect(models, `${SUBSCRIBE_LABELS_PATH}?cursor=42`);
    expect(ws.close).not.toHaveBeenCalled();
    expect(models.Label.findAll).toHaveBeenCalledTimes(1);
  });

  test('very large numeric cursors are fine (BigInt path)', async () => {
    const ws = await connect(fakeModels(), `${SUBSCRIBE_LABELS_PATH}?cursor=9007199254740993`);
    expect(ws.close).not.toHaveBeenCalled();
  });

  test('no cursor param still connects and backfills from the start', async () => {
    const models = fakeModels();
    const ws = await connect(models, SUBSCRIBE_LABELS_PATH);
    expect(ws.close).not.toHaveBeenCalled();
    expect(models.Label.findAll).toHaveBeenCalledTimes(1);
  });
});
