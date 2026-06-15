import React, { useEffect, useRef } from 'react';

const AuroraBackground: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      // Calculate normalized mouse position (-1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      
      // Move the container inversely to the mouse for a parallax effect
      // Or move it towards the mouse. Let's move it slightly towards the mouse.
      const moveX = x * 150; // Max movement of 150px
      const moveY = y * 150;
      
      containerRef.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      <div 
        ref={containerRef} 
        className="absolute inset-0 transition-transform duration-1000 ease-out"
        style={{ transform: 'translate(0px, 0px)' }}
      >
        {/* Blue Blob */}
        <div 
          className="absolute top-[-10%] left-[-10%] w-[1200px] h-[1200px] rounded-full mix-blend-screen opacity-35"
          style={{
            backgroundColor: '#2563eb',
            filter: 'blur(180px)',
            animation: 'aurora-1 15s ease-in-out infinite alternate',
          }}
        />
        {/* Cyan Blob */}
        <div 
          className="absolute top-[20%] right-[-10%] w-[1000px] h-[1000px] rounded-full mix-blend-screen opacity-30"
          style={{
            backgroundColor: '#06b6d4',
            filter: 'blur(180px)',
            animation: 'aurora-2 18s ease-in-out infinite alternate',
          }}
        />
        {/* Purple Blob */}
        <div 
          className="absolute bottom-[-20%] left-[20%] w-[900px] h-[900px] rounded-full mix-blend-screen opacity-25"
          style={{
            backgroundColor: '#8b5cf6',
            filter: 'blur(180px)',
            animation: 'aurora-3 12s ease-in-out infinite alternate',
          }}
        />
      </div>

      <style>{`
        @keyframes aurora-1 {
          0% { transform: translate(0, 0) scale(0.85); }
          50% { transform: translate(450px, 350px) scale(1.15); }
          100% { transform: translate(-400px, -300px) scale(1.25); }
        }
        @keyframes aurora-2 {
          0% { transform: translate(0, 0) scale(1.25); }
          50% { transform: translate(-450px, -350px) scale(0.85); }
          100% { transform: translate(400px, 300px) scale(1.15); }
        }
        @keyframes aurora-3 {
          0% { transform: translate(0, 0) scale(0.9); }
          50% { transform: translate(450px, -350px) scale(1.25); }
          100% { transform: translate(-400px, 300px) scale(0.85); }
        }
      `}</style>
    </div>
  );
};

export default AuroraBackground;
