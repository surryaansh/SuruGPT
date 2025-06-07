
import React from 'react';

const WelcomeMessage: React.FC = () => {
  return (
    // Main container for WelcomeMessage. It's positioned by App.tsx.
    // It will center its children (Giphy, Greeting) horizontally.
    <div className="flex flex-col items-center w-full">
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
      <p className="relative z-10 text-lg sm:text-xl font-normal text-[#EAE6F0] my-2">
        What can I help you with my cutu?
      </p>
    </div>
  );
};

export default WelcomeMessage;
