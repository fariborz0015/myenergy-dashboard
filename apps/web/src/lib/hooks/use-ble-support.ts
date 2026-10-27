'use client';

import { useEffect, useState } from 'react';
import { isWebBluetoothAvailable } from '@/lib/ble/web-bluetooth-transport';

export interface BleSupport {
  checked: boolean;
  supported: boolean;
  secure: boolean;
  ios: boolean;
  linux: boolean;
}

/** Detected after mount so server and client render the same markup. */
export function useBleSupport(): BleSupport {
  const [s, set] = useState<BleSupport>({ checked: false, supported: true, secure: true, ios: false, linux: false });
  useEffect(() => {
    const ua = navigator.userAgent;
    set({
      checked: true,
      supported: isWebBluetoothAvailable(),
      secure: window.isSecureContext,
      ios: /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document),
      linux: /Linux/.test(ua) && !/Android/.test(ua),
    });
  }, []);
  return s;
}
