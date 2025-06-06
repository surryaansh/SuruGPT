
import React from 'react';
import { IconSuru, IconHeart } from '../constants'; // Import IconSuru

const WelcomeMessage: React.FC = () => {
  const numHearts = 15; // Number of hearts to display

  return (
    <div className="relative flex-grow flex flex-col items-center justify-center text-center px-4 py-8 overflow-hidden">
      {/* Hearts Container - position absolute, behind content */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        {Array.from({ length: numHearts }).map((_, index) => (
          <IconHeart
            key={index}
            className="heart-float text-[#FF8DC7]" // Use pink accent, defined in index.html
            style={{
              left: `${Math.random() * 100}%`, // Random horizontal position
              animationDuration: `${Math.random() * 6 + 7}s`, // Random duration (7-13s)
              animationDelay: `${Math.random() * 7}s`,    // Random delay (0-7s)
              // Random size for a bit more variety, keeping them small
              width: `${Math.floor(Math.random() * 8 + 10)}px`, // Size between 10px and 17px
              height: `${Math.floor(Math.random() * 8 + 10)}px`,
            }}
          />
        ))}
      </div>

      {/* Original Content - ensure it's above the hearts with relative positioning and z-index. Added flex for centering. */}
      <div className="relative z-10 flex flex-col items-center"> {/* Centering icon and text */}
        <IconSuru 
            className="w-20 h-20 text-[#FF8DC7] mb-6 animate-fadeInSlideUp" 
            style={{ animationDelay: '0.1s' }} 
        />
        <h1 
            className="text-2xl sm:text-3xl text-[#EAE6F0] mb-2 animate-fadeInSlideUp" 
            style={{ animationDelay: '0.2s' }}
        >
          Hey Manvi! SuruGPT at your service!
        </h1>
        <p 
            className="text-lg text-[#A09CB0] animate-fadeInSlideUp" 
            style={{ animationDelay: '0.3s' }}
        >
          What lovely things are we chatting about today?
        </p>
      </div>
    </div>
  );
};

export default WelcomeMessage;
