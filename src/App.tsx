/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { StoreProvider } from './store';
import { MainLayout } from './components/MainLayout';

export default function App() {
  return (
    <StoreProvider>
      <MainLayout />
    </StoreProvider>
  );
}
