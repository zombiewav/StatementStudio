import React, { useEffect, useRef } from 'react';
import './Aurora.css';

const Aurora = ({
  colorStops = ['#1D4ED8', '#06B6D4', '#7C3AED'],
  blend = 0.4,
  amplitude = 0.9,
  speed = 0.5,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(
      vertexShader,
      `
      precision highp float;
      attribute vec2 position;
      varying vec2 vUv;
      
      void main() {
        vUv = position * 0.5 + 0.5;
        gl.Position = vec4(position, 0.0, 1.0);
      }
    `
    );
    gl.compileShader(vertexShader);

    // Fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    const colorStopCount = colorStops.length;
    let colorCode = '';
    
    for (let i = 0; i < colorStops.length; i++) {
      const color = colorStops[i];
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      colorCode += `
        if (t < ${((i + 1) / colorStops.length).toFixed(2)}) {
          return vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)});
        }
      `;
    }

    gl.shaderSource(
      fragmentShader,
      `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uAmplitude;
      uniform float uSpeed;
      uniform float uBlend;
      
      vec3 getColor(float t) {
        ${colorCode}
        return vec3(0.1, 0.1, 0.2);
      }
      
      float noise(vec2 p) {
        return sin(p.x * 10.0) * cos(p.y * 10.0) * 0.5 + 0.5;
      }
      
      void main() {
        vec2 uv = vUv;
        
        // Create aurora wave effect
        float wave1 = sin(uv.x * 3.0 + uTime * uSpeed) * uAmplitude;
        float wave2 = cos(uv.y * 2.0 + uTime * uSpeed * 0.7) * uAmplitude * 0.5;
        float wave3 = sin((uv.x + uv.y) * 2.5 - uTime * uSpeed * 0.5) * uAmplitude * 0.3;
        
        float waves = wave1 + wave2 + wave3;
        
        // Create vertical gradient with wave distortion
        float y = uv.y + waves * 0.15;
        float gradient = 1.0 - abs(y - 0.5) * 2.0;
        gradient = smoothstep(0.0, 1.0, gradient);
        
        // Add some turbulence
        float turbulence = sin(uv.x * 5.0 + uTime * uSpeed * 0.3) * 0.3;
        gradient += turbulence * gradient;
        
        vec3 color = getColor(y);
        float alpha = gradient * uBlend;
        
        gl_FragColor = vec4(color, alpha);
      }
    `
    );
    gl.compileShader(fragmentShader);

    // Create program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Set up geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const timeLocation = gl.getUniformLocation(program, 'uTime');
    const amplitudeLocation = gl.getUniformLocation(program, 'uAmplitude');
    const speedLocation = gl.getUniformLocation(program, 'uSpeed');
    const blendLocation = gl.getUniformLocation(program, 'uBlend');

    // Animation loop
    let animationId;
    let startTime = Date.now();

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;

      gl.uniform1f(timeLocation, elapsed);
      gl.uniform1f(amplitudeLocation, amplitude);
      gl.uniform1f(speedLocation, speed);
      gl.uniform1f(blendLocation, blend);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [colorStops, blend, amplitude, speed]);

  return <canvas ref={canvasRef} className="aurora-canvas" />;
};

export default Aurora;
