import { waitFor } from '@testing-library/react-native';

import FavoritesScreen from '@/app/(tabs)/favorites';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

function seed(withFavorites: boolean) {
  const db = useMemoryDb();
  seedPoems(db, [
    { id: 1, title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓' },
  ]);
  if (withFavorites) {
    asDb(db).runAsync('INSERT INTO favorites (poem_id) VALUES (?)', 2);
  }
  return db;
}

describe('<FavoritesScreen />', () => {
  it('没有收藏时给出空态', async () => {
    await renderWithTheme(<FavoritesScreen />, { db: seed(false) });
    expect(screen.getByText('把喜欢的诗词收进这里')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('favorites-empty')).toBeTruthy());
  });

  it('列出收藏的诗，并显示数量', async () => {
    await renderWithTheme(<FavoritesScreen />, { db: seed(true) });
    await waitFor(() => expect(screen.getByText('已收藏 1 首')).toBeTruthy());
    expect(screen.getByText('春晓')).toBeTruthy();
    expect(screen.queryByText('静夜思')).toBeNull();
  });
});
