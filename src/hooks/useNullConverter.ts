import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export interface NullConverterItem { mode: string; label: string; }
export interface NullConverterInfo {
  exe: string;
  folder_items: NullConverterItem[];
  file_items: NullConverterItem[];
}

// Promise-singleton: TreeView and OutputOverview mount simultaneously.
// Both .then() onto the same promise — single invoke per session.
let _promise: Promise<NullConverterInfo | null> | null = null;

function fetchNullConverter(): Promise<NullConverterInfo | null> {
  if (!_promise) {
    _promise = invoke<NullConverterInfo | null>('detect_null_converter').catch(() => null);
  }
  return _promise;
}

export function useNullConverter(): NullConverterInfo | null {
  const [info, setInfo] = useState<NullConverterInfo | null>(null);
  useEffect(() => { fetchNullConverter().then(setInfo); }, []);
  return info;
}
