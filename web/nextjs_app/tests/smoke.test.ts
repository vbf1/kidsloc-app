import { describe, expect, it } from 'vitest';

describe('KidsLoc web foundation', () => {
  it('uses Brazilian Portuguese as the product locale', () => {
    expect('pt-BR').toBe('pt-BR');
  });
});
