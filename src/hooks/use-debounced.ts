"use client";
import { useEffect, useState } from "react";
export function useDebounced<T>(value: T, delay = 200) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return result;
}
