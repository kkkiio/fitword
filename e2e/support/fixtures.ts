import { test as base, createBdd } from 'playwright-bdd';

import { FitwordWorkspacePage } from '../pages/workspace.page';
import { FitwordE2eApp } from './fitword-app';

type Fixtures = {
  fitword: FitwordE2eApp;
  workspace: FitwordWorkspacePage;
};

export const test = base.extend<Fixtures>({
  fitword: async ({ page }, use, testInfo) => {
    const app = new FitwordE2eApp(page, testInfo);
    await use(app);
    await app.stop();
  },
  workspace: async ({ page, fitword }, use) => {
    await use(new FitwordWorkspacePage(page, fitword));
  },
});

export const { Given, When, Then } = createBdd(test);
