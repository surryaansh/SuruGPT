
import React, { useEffect } from 'react';
import { IconHeart } from '../constants'; // IconSuru removed

const WelcomeMessage: React.FC = () => {
  const numHearts = 15; // Number of hearts to display

  useEffect(() => {
    const tenorScriptSrc = "https://tenor.com/embed.js";
    // Check if the script is already on the page
    let script = document.querySelector(`script[src="${tenorScriptSrc}"]`) as HTMLScriptElement | null;

    if (!script) {
      // If not, create and append it
      script = document.createElement('script');
      script.src = tenorScriptSrc;
      script.async = true;
      document.body.appendChild(script);
    }
    // Tenor's script will find and initialize GIF embeds.
    // No specific cleanup for the script tag itself in the return function,
    // as it's generally safe and useful to leave it loaded if other components might use it.
  }, []);


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
      <div className="relative z-10 flex flex-col items-center">
        {/* GIF Container - Replaces IconSuru */}
        <div
          className="w-36 h-36 sm:w-48 sm:h-48 mb-6 animate-fadeInSlideUp" // Adjusted size for the GIF container
          style={{ animationDelay: '0.1s' }}
          dangerouslySetInnerHTML={{
            __html: `<div class="tenor-gif-embed" data-postid="10623645" data-share-method="host" data-aspect-ratio="1" data-width="100%"><a href="https://tenor.com/view/cats-dance-love-cute-cat-gif-10623645">Cats Dance GIF</a>from <a href="https://tenor.com/search/cats-gifs">Cats GIFs</a></div>`
          }}
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
