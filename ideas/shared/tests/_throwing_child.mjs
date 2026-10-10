// A pool child for test_pool.mjs: answers 'echo', throws on anything else.
// No simulator.
process.on('message', async (msg) => {
  if (msg.track) { if (msg.failAtStart) throw new Error('refusing to start'); process.send({ ready: true }); return; }
  if (msg.cmd === 'echo') { process.send({ id: msg.id, said: msg.text }); return; }
  throw new Error(`cannot do "${msg.cmd}"`);
});
