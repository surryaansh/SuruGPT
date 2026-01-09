
import React from 'react';
import { IconHeart } from '../constants';

const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-[#2E2B36] text-[#EAE6F0]">
    <IconHeart className="w-10 h-10 mb-4 text-[#FFD1DC] animate-pulse" style={{ filter: 'blur(0.5px)' }} />
    <p className="text-lg">Initializing SuruGPT...</p>
  </div>
);

export default LoadingScreen;
