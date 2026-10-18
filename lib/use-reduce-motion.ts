import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Benar bila pengguna meminta sistem mengurangkan gerakan (animasi dimatikan / dikurangkan). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      if (active) setReduce(value);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
