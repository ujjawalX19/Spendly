import { useEffect, useState } from 'react';
import { queuedItems, subscribeQueue } from '../lib/missionSync';

/** Mission actions saved on this phone and not yet accepted by the server (and recent results). */
export function usePendingActions(session) {
  const userId = session?.user?.id;
  const [items, setItems] = useState(() => queuedItems(session));
  useEffect(() => {
    setItems(queuedItems(session));
    return subscribeQueue(() => setItems(queuedItems(session)));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return items;
}
