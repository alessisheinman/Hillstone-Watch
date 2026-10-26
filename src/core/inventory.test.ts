import { describe, expect, it } from 'vitest';
import released from './__fixtures__/inventory-2026-11-02-party2.json';
import unreleased from './__fixtures__/inventory-unreleased.json';
import { inventoryUrl, isConfirmationPath, mergeInventories, parseInventory, searchPoints } from './inventory';

describe('inventoryUrl', () => {
  it('asks Wisely for open times around the searched time', () => {
    const url = new URL(inventoryUrl('2026-11-02', '19:00', 2));
    expect(url.origin + url.pathname).toBe('https://loyaltyapi.wisely.io/v2/web/reservations/inventory');
    expect(url.searchParams.get('merchant_id')).toBe('278278');
    expect(url.searchParams.get('party_size')).toBe('2');
    expect(url.searchParams.get('search_ts')).toBe('1793664000000');
    expect(url.searchParams.get('limit')).toBe('50');
  });
});

describe('parseInventory', () => {
  it('lists open slots earliest first, Dinner before Lunch at the same time', () => {
    const inv = parseInventory(released, 2);
    expect(inv.released).toBe(true);
    expect(inv.slots[0]).toEqual({ reservedTs: 1793638800000, displayTime: '12:00 PM', typeName: 'Dinner', typeId: 1695 });
    expect(inv.slots).toContainEqual({ reservedTs: 1793671200000, displayTime: '9:00 PM', typeName: 'Dinner', typeId: 1695 });
  });

  it('drops slots too small for the party', () => {
    const slots = parseInventory(released, 3).slots.filter((s) => s.reservedTs === 1793638800000);
    expect(slots.map((s) => s.typeName)).toEqual(['Lunch']);
  });

  it('reports a day that is not released yet', () => {
    expect(parseInventory(unreleased, 2)).toEqual({ released: false, slots: [] });
  });

  it('throws on a response that is not Wisely inventory', () => {
    expect(() => parseInventory('<html>', 2)).toThrow('Unexpected response');
    expect(() => parseInventory({}, 2)).toThrow('Unexpected response');
  });
});

describe('searchPoints', () => {
  // Wisely only returns times within roughly ±6 hours of the searched time, not the whole day.
  it('searches once from the middle of a short window', () => {
    expect(searchPoints({ date: '2026-11-02', from: '19:00', to: '21:00' })).toEqual(['20:00']);
    expect(searchPoints({ date: '2026-11-02', from: '12:00', to: '12:00' })).toEqual(['12:00']);
    expect(searchPoints({ date: '2026-11-02', from: '19:00', to: '19:45' })).toEqual(['19:22']);
  });

  it('searches every 4 hours across a long window, ending at the end', () => {
    expect(searchPoints({ date: '2026-11-02', from: '11:00', to: '23:00' })).toEqual(['11:00', '15:00', '19:00', '23:00']);
    expect(searchPoints({ date: '2026-11-02', from: '11:00', to: '21:00' })).toEqual(['11:00', '15:00', '19:00', '21:00']);
  });
});

describe('mergeInventories', () => {
  const slot = (ts: number, typeId = 1695) => ({ reservedTs: ts, displayTime: 'x', typeId, typeName: typeId === 1695 ? 'Dinner' : 'Lunch' });

  it('combines searches without duplicates, earliest first', () => {
    const merged = mergeInventories([
      { released: true, slots: [slot(3), slot(5)] },
      { released: true, slots: [slot(1), slot(3), slot(3, 1862)] },
    ]);
    expect(merged).toEqual({ released: true, slots: [slot(1), slot(3), slot(3, 1862), slot(5)] });
  });

  it('is not released if any search says so', () => {
    expect(mergeInventories([{ released: true, slots: [] }, { released: false, slots: [] }]).released).toBe(false);
  });
});

describe('isConfirmationPath', () => {
  it("recognises Wisely's confirmation page", () => {
    expect(isConfirmationPath('/hillstone-park-avenue/abc123/confirm')).toBe(true);
    expect(isConfirmationPath('/hillstone-park-avenue/abc123/confirm/')).toBe(true);
  });

  it('does not treat other pages as success', () => {
    expect(isConfirmationPath('/hillstone-park-avenue/review')).toBe(false);
    expect(isConfirmationPath('/hillstone-park-avenue')).toBe(false);
    expect(isConfirmationPath('/hillstone-park-avenue/')).toBe(false);
    expect(isConfirmationPath('/hillstone-park-avenue/abc123/cancel')).toBe(false);
  });
});
