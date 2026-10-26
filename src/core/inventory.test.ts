import { describe, expect, it } from 'vitest';
import released from './__fixtures__/inventory-2026-11-02-party2.json';
import unreleased from './__fixtures__/inventory-unreleased.json';
import { inventoryUrl, parseInventory } from './inventory';

describe('inventoryUrl', () => {
  it('asks Wisely for the whole day starting at the window start', () => {
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
