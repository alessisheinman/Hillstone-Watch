import { describe, expect, it } from 'vitest';
import { initialState } from '../core/machine';
import type { ExtToSite } from '../core/types';
import { connect, send } from './bridge';

/** Stands in for the browser window: postMessage delivers to every listener on the same object. */
class FakeWindow extends EventTarget {
  posted: unknown[] = [];
  postMessage(data: unknown) {
    this.posted.push(data);
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

const snapshot: ExtToSite = { type: 'snapshot', snapshot: { state: initialState(), guest: null } };

/** Pretends to be the extension: answers every hello with a snapshot. */
function withExtension(win: FakeWindow) {
  win.addEventListener('message', (e) => {
    const data = (e as MessageEvent).data;
    if (data?.source === 'hw-site' && data.msg.type === 'hello') win.postMessage({ source: 'hw-ext', msg: snapshot });
  });
}

describe('bridge', () => {
  it('finds the extension when it answers hello', async () => {
    const win = new FakeWindow();
    withExtension(win);
    const got: ExtToSite[] = [];
    await expect(connect(win as unknown as Window, (m) => got.push(m), 50)).resolves.toBe(true);
    expect(got).toEqual([snapshot]);
  });

  it('reports no extension after the timeout', async () => {
    await expect(connect(new FakeWindow() as unknown as Window, () => {}, 20)).resolves.toBe(false);
  });

  it('ignores messages that are not from the extension', async () => {
    const win = new FakeWindow();
    const got: ExtToSite[] = [];
    await connect(win as unknown as Window, (m) => got.push(m), 20);
    win.postMessage({ source: 'someone-else', msg: snapshot });
    win.postMessage('hello');
    expect(got).toEqual([]);
  });

  it('wraps outgoing messages for the extension', () => {
    const win = new FakeWindow();
    send(win as unknown as Window, { type: 'stop' });
    expect(win.posted).toEqual([{ source: 'hw-site', msg: { type: 'stop' } }]);
  });
});
