import React from 'react';

// IconHeart import removed as hearts are no longer used here.

const WelcomeMessage: React.FC = () => {
  return (
    // Simplified container: centers the Giphy content.
    // Removed py-8, flex-grow, text-center, px-4, overflow-hidden as they are not needed for just the GIF.
    <div className="flex flex-col items-center">
      {/* Giphy Embed Container */}
      <div 
        // Applied ~20% size reduction:
        // w-48 (192px) -> w-[154px] (192 * 0.8 = 153.6)
        // h-40 (160px) -> h-[128px] (160 * 0.8 = 128)
        // sm:w-64 (256px) -> sm:w-[205px] (256 * 0.8 = 204.8)
        // sm:h-52 (208px) -> sm:h-[166px] (208 * 0.8 = 166.4)
        // Reduced bottom margin from mb-6 to mb-4 as text below is removed.
        className="relative mb-4 animate-fadeInSlideUp w-[154px] h-[128px] sm:w-[205px] sm:h-[166px]"
        style={{ animationDelay: '0.1s' }}
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
      
      {/* Removed Giphy link paragraph */}
      {/* Removed h1 greeting and p descriptive text */}
    </div>
  );
};

export default WelcomeMessage;
