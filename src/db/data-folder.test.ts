import { describe, expect, it } from 'vitest';

import { dataFolder } from './data-folder';

describe('dataFolder', () => {
  it('is the checkout data folder when nothing is set', () => {
    expect(dataFolder({}, '/code/tandembike')).toBe('/code/tandembike/data');
  });

  it('is TANDEMBIKE_DATA_DIR when set', () => {
    expect(
      dataFolder({ TANDEMBIKE_DATA_DIR: '/home/me/.tandembike' }, '/code/t'),
    ).toBe('/home/me/.tandembike');
  });

  it('ignores an empty TANDEMBIKE_DATA_DIR', () => {
    expect(dataFolder({ TANDEMBIKE_DATA_DIR: '' }, '/code/t')).toBe(
      '/code/t/data',
    );
  });
});
