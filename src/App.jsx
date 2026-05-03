import React, { useState, useEffect } from 'react';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';

export default function App() {
  const [screen, setScreen] = useState('start');
  const [gameConfig, setGameConfig] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('omok-theme') || 'classic';
  });

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('omok-theme', theme);
  }, [theme]);

  const handleStart = (config) => {
    setGameConfig(config);
    setScreen('game');
  };

  const handleExit = () => {
    setGameConfig(null);
    setScreen('start');
  };

  if (screen === 'start') {
    return (
      <StartScreen
        onStart={handleStart}
        onThemeChange={setTheme}
        currentTheme={theme}
      />
    );
  }
  return <GameScreen config={gameConfig} onExit={handleExit} />;
}
