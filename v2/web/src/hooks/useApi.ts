import { useEffect, useState, useCallback } from 'react';

/**
 * useApi — fetch + loading + error en un hook.
 * Reemplaza el patron repetido del v1: spinner manual + try/catch + toast por pagina.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message ?? 'Error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => reload(), [reload]);
  return { data, loading, error, reload, setData };
}
