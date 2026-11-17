import { useCallback, useState } from 'react'

const prefix = 'fufu:'
export function readStorage<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  try {
    const raw = localStorage.getItem(prefix + key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return validate && !validate(value) ? fallback : (value as T)
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value))
  } catch {
    /* Private browsing and full storage must not break tools. */
  }
}

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export function useStoredState<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback, validate))
  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next
        writeStorage(key, result)
        return result
      })
    },
    [key],
  )
  return [value, update] as const
}
