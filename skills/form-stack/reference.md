# Form draft persistence — reference

Copy into the product app as `lib/form-draft.ts` and `hooks/use-form-draft.ts`. Long full-page forms only — never dialogs, passwords, or payment.

## `lib/form-draft.ts`

```typescript
/**
 * Form helpers: draft persistence (long full-page forms only) and dirty
 * checks (edit/settings saves). Never draft dialogs, passwords, or payment.
 * Keys: {app}.form.draft.<form>:<userId>
 */

export type FormDraft<T> = {
  values: T;
  ts: number;
};

export function readFormDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormDraft<T>>;
    if (parsed?.values == null) return null;
    return parsed.values;
  } catch {
    return null;
  }
}

export function writeFormDraft<T>(key: string, values: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: FormDraft<T> = { values, ts: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // private mode / quota
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Structural equality for flat/nested form values. */
export function isFormDirty<T>(current: T, baseline: T): boolean {
  return stableStringify(current) !== stableStringify(baseline);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, (v as Record<string, unknown>)[k]]),
      );
    }
    return v;
  });
}
```

## `hooks/use-form-draft.ts`

```typescript
/**
 * Persist form values across reload. Opt-in via key; clear on successful submit.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearFormDraft,
  isFormDirty,
  readFormDraft,
  writeFormDraft,
} from "@/lib/form-draft";

export function useFormDraft<T>(key: string | null, defaults: T) {
  const [values, setValues] = useState<T>(() => {
    if (!key) return defaults;
    return readFormDraft<T>(key) ?? defaults;
  });

  useEffect(() => {
    if (!key) return;
    if (!isFormDirty(values, defaults)) {
      clearFormDraft(key);
      return;
    }
    writeFormDraft(key, values);
  }, [key, values, defaults]);

  const patch = useCallback((next: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...next }));
  }, []);

  const clear = useCallback(() => {
    if (key) clearFormDraft(key);
    setValues(defaults);
  }, [key, defaults]);

  return { values, setValues, patch, clear };
}
```

## Storage key

```
{app}.form.draft.{flow}.{resource}:{userId}
```

Example: `tw.form.draft.onboarding.workspace:user_abc`
