import { createdId, expect, gotoApp, test } from './fixtures';

// The cheat sheet reads the hole masses from the catalog and works the jumps out for the
// ship typed in, so the numbers here are the old quick reference chart's.
test('rolling cheat sheet: steps per hole mass, for the ship typed in', async ({ page, api }) => {
	const mapId = await createdId(await api.post('/api/maps', { data: { name: 'E2E Rolling' } }));
	await gotoApp(page, `/maps/${mapId}`);

	await page.getByTestId('rolling-button').click();
	const dialog = page.getByTestId('rolling-dialog');
	await expect(dialog).toBeVisible();

	// C247 is a 2,000 kt hole: two cold and two hot, then it depends.
	await dialog.getByTestId('rolling-find').fill('c247');
	const hole = dialog.getByTestId('rolling-class');
	await expect(dialog.getByRole('tab', { selected: true })).toHaveText('2,000 kt');
	await expect(hole.getByTestId('rolling-first')).toHaveText(/^\s*2 cold\s*2 hot\s*$/);
	await expect(hole.getByTestId('rolling-reduced-roll')).toContainText(/2 cold\s*2 hot/);
	await expect(hole.getByTestId('rolling-fresh-roll')).toContainText('4 hot');
	await expect(hole.getByTestId('rolling-reduced-crit')).toContainText('4 cold');

	// A lighter ship takes more jumps, and is remembered.
	await dialog.getByTestId('rolling-cold').fill('100');
	await dialog.getByTestId('rolling-hot').fill('200');
	await expect(hole.getByTestId('rolling-first')).toHaveText('5 hot');
	await page.reload();
	await page.getByTestId('rolling-button').click();
	await expect(page.getByTestId('rolling-hot')).toHaveValue('200');

	// A frigate hole has no plan for it, and a tab takes the search back off.
	await page.getByTestId('rolling-find').fill('e004');
	await expect(page.getByTestId('rolling-plan')).toHaveCount(0);
	await expect(page.getByTestId('rolling-too-small')).toContainText('E004');
	await page.getByRole('tab', { name: '3,300 kt' }).click();
	await expect(page.getByTestId('rolling-find')).toHaveValue('');
	await expect(page.getByTestId('rolling-plan')).toHaveCount(1);
});
