
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
    setGiphyIframeSrc("https://giphy.com/embed/eveEChlJE0YhdeVXEj"); // Giphy URL

  }, []); // Empty dependency array ensures this runs only on mount

  return (
    // Main container for WelcomeMessage. It's positioned by App.tsx.
    // It will center its children (Giphy, Greeting) horizontally.
    <div className="flex flex-col items-center w-full">
      {/* Giphy Embed Container - relative, z-10 for layering */}
      <div
        className="relative z-10 mb-2 w-[154px] h-[128px] sm:w-[205px] sm:h-[166px] flex items-center justify-center" // This container defines the Giphy's bounds
        style={{ animationDelay: '0.1s' }} // Existing animation
      >
        {/* Render new structure only when src is set */}
        {giphyIframeSrc && (
          <>
            <div
              style={{
                width: '100%', // Takes width of parent (e.g., 154px)
                height: 0,
                paddingBottom: '85%', // Height becomes 85% of width
                position: 'relative',
                opacity: giphyIframeSrc ? 1 : 0, // Apply opacity logic from old iframe
                transition: 'opacity 0.4s ease-in-out' // Apply transition from old iframe
              }}
            >
              <iframe
                src={giphyIframeSrc}
                width="100%" // Fills the 100% width of its direct parent (the div above)
                height="100%" // Fills the 100% height of its direct parent (the div above)
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  border: '0',
                }}
                className="giphy-embed"
                allowFullScreen
                title="Cute Giphy Embed"
              />
            </div>

            {/* Transparent overlay to prevent Giphy hover effects, shown when Giphy is visible */}
            {/* This overlay should still cover the entire area of the outer Giphy container.
                Its current placement as a sibling to the Giphy structure, with absolute inset-0,
                will make it cover the parent container (the one with w-[154px] etc.).
            */}
            <div className="absolute inset-0 z-[1]"></div>
          </>
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
