import React, { useEffect, useRef } from 'react';

const WelcomeMessage: React.FC = () => {
  const heartsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = heartsContainerRef.current;
    if (!container) return;

    const numHearts = 15; // Number of hearts
    const hearts: HTMLElement[] = [];

    for (let i = 0; i < numHearts; i++) {
      const heart = document.createElement('span');
      heart.classList.add('heart-float');
      heart.textContent = '💜'; 
      heart.style.left = `${Math.random() * 100}%`;
      heart.style.animationDuration = `${Math.random() * 3 + 4}s`; // 4s to 7s
      heart.style.animationDelay = `${Math.random() * 3}s`;
      heart.style.fontSize = `${Math.random() * 10 + 10}px`; // 10px to 20px
      heart.style.filter = `blur(${Math.random() * 1.5}px)`;
      container.appendChild(heart);
      hearts.push(heart);
    }

    return () => {
      hearts.forEach(heart => heart.remove());
    };
  }, []);

  return (
    // Main container for WelcomeMessage. It's positioned by App.tsx.
    // It will center its children (Giphy, Greeting) horizontally.
    <div className="flex flex-col items-center w-full">
      {/* Hearts Background - absolute, covers this component's area */}
      <div
        ref={heartsContainerRef}
        className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0"
        aria-hidden="true"
      >
        {/* Hearts are dynamically added here */}
      </div>

      {/* Giphy Embed Container - relative, z-10 for layering */}
      <div
        className="relative z-10 mb-3 w-[154px] h-[128px] sm:w-[205px] sm:h-[166px]" // Reduced Giphy size by ~20%
        style={{ animationDelay: '0.1s' }} // Existing animation
      >
        <iframe
          src="https://giphy.com/embed/BnX3LZNpuI2oUJHac0"
          width="100%"
          height="100%"
          style={{ border: '0' }}
          frameBorder="0"
          className="giphy-embed"
          allowFullScreen
          title="Cute Giphy Embed"
        ></iframe>
        {/* Transparent overlay to prevent Giphy hover effects */}
        <div className="absolute inset-0 z-[1]"></div>
      </div>

      {/* Greeting Text - relative, z-10 for layering */}
      <p className="relative z-10 text-lg sm:text-xl font-medium text-[#EAE6F0] my-2">
        What can I help you with my cutu?
      </p>
    </div>
  );
};

export default WelcomeMessage;
