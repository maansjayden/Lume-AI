import { useEffect, useRef } from 'react';

export function useShake(onShake: () => void) {
  const lastUpdate = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastZ = useRef(0);
  const SHAKE_THRESHOLD = 800;

  useEffect(() => {
    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const curTime = Date.now();
      if ((curTime - lastUpdate.current) > 100) {
        const diffTime = curTime - lastUpdate.current;
        lastUpdate.current = curTime;

        const { x, y, z } = acceleration;
        const speed = Math.abs((x || 0) + (y || 0) + (z || 0) - lastX.current - lastY.current - lastZ.current) / diffTime * 10000;

        if (speed > SHAKE_THRESHOLD) {
          onShake();
        }

        lastX.current = x || 0;
        lastY.current = y || 0;
        lastZ.current = z || 0;
      }
    };

    if (typeof DeviceMotionEvent !== 'undefined') {
      // Request permission for iOS 13+
      if ((DeviceMotionEvent as any).requestPermission) {
        (DeviceMotionEvent as any).requestPermission()
          .then((response: string) => {
            if (response === 'granted') {
              window.addEventListener('devicemotion', handleMotion);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener('devicemotion', handleMotion);
      }
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [onShake]);
}
