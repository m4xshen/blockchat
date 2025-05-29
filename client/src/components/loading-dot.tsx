'use client';

import { useEffect, useState } from 'react';

// Create a module-level variable to track if animation has started
let animationStarted = false;
let animationStartTime = 0;

export function LoadingDot() {
  const [style, setStyle] = useState({});
  
  useEffect(() => {
    // If this is the first LoadingDot being mounted
    if (!animationStarted) {
      animationStarted = true;
      animationStartTime = Date.now();
    } else {
      // For subsequent dots, calculate how far into the animation we are
      const timeElapsed = (Date.now() - animationStartTime) % 1500; // 1.5s animation duration
      const animationProgress = timeElapsed / 1500;
      
      // Set the animation delay to sync with the first dot
      setStyle({
        animationDelay: `-${animationProgress * 1.5}s`
      });
    }
  }, []);
  
  return (
    <span 
      className="inline-block flex-shrink-0 w-3 h-3 rounded-full bg-black dark:bg-white animate-[scale-pulse_1.5s_ease-in-out_infinite] ml-1"
      style={style}
    ></span>
  );
}
