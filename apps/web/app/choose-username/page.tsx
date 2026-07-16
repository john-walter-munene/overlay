import { Suspense } from 'react';
import ChooseUsernameClient from './ChooseUsernameClient';

// useSearchParams (in ChooseUsernameClient) requires a Suspense boundary for
// the static prerender/CSR-bailout.
export default function ChooseUsernamePage() {
  return (
    <Suspense fallback={null}>
      <ChooseUsernameClient />
    </Suspense>
  );
}
