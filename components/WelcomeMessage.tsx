import React, { useState, useEffect } from 'react';
import { greetings } from '../greetings'; // Import the new greetings list

const WelcomeMessage: React.FC = () => {
  const [currentGreeting, setCurrentGreeting] = useState('');
  const [giphyIframeSrc, setGiphyIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    // Select a random greeting when the component mounts
    const randomIndex = Math.floor(Math.random() * greetings.length);
    setCurrentGreeting(greetings[randomIndex]);

    // Set the Giphy iframe source immediately on mount
    setGiphyIframeSrc("https://giphy.com/embed/BnX3LZNpuI2oUJHac0");

  }, []); // Empty dependency array ensures this runs only on mount

  return (
    // Main container for WelcomeMessage. It's positioned by App.tsx.
    // It will center its children (Giphy, Greeting) horizontally.
    <div className="flex flex-col items-center w-full">
      {/* Giphy Embed Container - relative, z-10 for layering */}
      <div
        className="relative z-10 mb-2 w-[154px] h-[128px] sm:w-[205px] sm:h-[166px] flex items-center justify-center" // Changed mb-3 to mb-2
        style={{ animationDelay: '0.1s' }} // Existing animation
      >
        {/* Render iframe only when src is set, control opacity for fade-in */}
        {giphyIframeSrc && (
          <iframe
            src={giphyIframeSrc}
            width="100%"
            height="100%"
            style={{ 
              border: '0',
              opacity: giphyIframeSrc ? 1 : 0, // Opacity depends on src being set
              transition: 'opacity 0.4s ease-in-out'
            }}
            className="giphy-embed"
            allowFullScreen
            title="Cute Giphy Embed"
            
          />
        )}
        
        {/* Transparent overlay to prevent Giphy hover effects, shown when Giphy is visible */}
        {giphyIframeSrc && ( // Show overlay when Giphy source is set (meaning it's visible or fading in)
            <div className="absolute inset-0 z-[1]"></div>
        )}
      </div>

      {/* Greeting Text - relative, z-10 for layering */}
      <p className="relative z-10 text-lg sm:text-xl font-normal text-[#EAE6F0] my-1 text-center px-4"> {/* Changed my-2 to my-1 */}
        {currentGreeting}
      </p>
    </div>
  );
};

export default WelcomeMessage;
