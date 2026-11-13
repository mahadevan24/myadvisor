"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  layer: number; // 0 = distant, 1 = mid, 2 = near
  color: string;
}

interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  dx: number;
  dy: number;
  opacity: number;
  maxOpacity: number;
  fadeSpeed: number;
  size: number;
  trailColor: string;
  headColor: string;
  age: number;
  maxAge: number;
}

interface DistantSatellite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  blinkPhase: number;
  blinkSpeed: number;
  active: boolean;
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Stars collection
    let stars: Star[] = [];
    const shootingStars: ShootingStar[] = [];
    let nextShootingStarTime = performance.now() + 1500; // First shooting star soon after load

    // Distant satellite / space station beacon
    let satellite: DistantSatellite = {
      x: -50,
      y: 100,
      vx: 0.35,
      vy: 0.08,
      size: 1.5,
      blinkPhase: 0,
      blinkSpeed: 0.05,
      active: true,
    };
    let nextSatelliteSpawn = performance.now() + 8000;

    // Orbital movement settings
    // Simulates looking out from an orbiting satellite moving through space
    // Stars slowly drift along an orbital tangent vector (~18-20 degree tilt)
    const orbitalAngle = (18 * Math.PI) / 180;
    const baseOrbitalSpeed = 0.22; // pixels per frame at 60fps
    const dirX = Math.cos(orbitalAngle);
    const dirY = Math.sin(orbitalAngle);

    // Color palettes for stars
    const starColors = [
      "rgba(255, 255, 255,", // Pure white
      "rgba(225, 238, 255,", // Cool icy blue
      "rgba(200, 225, 255,", // Deep blue-white
      "rgba(255, 245, 220,", // Warm star gold
      "rgba(245, 230, 255,", // Faint violet
    ];

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx!.scale(dpr, dpr);
      initStars();
    }

    function initStars() {
      // Density based on viewport area
      const area = width * height;
      const count = Math.max(220, Math.floor(area / 3600));

      stars = [];
      for (let i = 0; i < count; i++) {
        // Distribute layers: 60% distant, 28% mid, 12% near
        const rand = Math.random();
        let layer = 0;
        let size = 0.7 + Math.random() * 0.7;
        let baseAlpha = 0.35 + Math.random() * 0.35;

        if (rand > 0.88) {
          layer = 2; // Near stars
          size = 1.7 + Math.random() * 1.3;
          baseAlpha = 0.7 + Math.random() * 0.28;
        } else if (rand > 0.6) {
          layer = 1; // Mid stars
          size = 1.1 + Math.random() * 0.7;
          baseAlpha = 0.5 + Math.random() * 0.35;
        }

        const colorBase = starColors[Math.floor(Math.random() * starColors.length)];

        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size,
          baseAlpha,
          twinkleSpeed: 0.015 + Math.random() * 0.035,
          twinklePhase: Math.random() * Math.PI * 2,
          layer,
          color: colorBase,
        });
      }
    }

    function createShootingStar(): ShootingStar {
      // Shooting stars travel rapidly at an angle
      const angle = (Math.PI / 180) * (32 + Math.random() * 26); // 32 to 58 degrees
      const speed = 14 + Math.random() * 10;
      const length = 110 + Math.random() * 130;

      // Spawn in top or top-left area
      const fromTop = Math.random() > 0.35;
      const x = fromTop ? Math.random() * width * 0.85 : -20;
      const y = fromTop ? Math.random() * (height * 0.4) : Math.random() * (height * 0.5);

      const isWarm = Math.random() > 0.7;
      const headColor = isWarm ? "#fff8e7" : "#e0f2fe";
      const trailColor = isWarm ? "255, 215, 150" : "165, 220, 255";

      return {
        x,
        y,
        length,
        speed,
        angle,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        opacity: 0,
        maxOpacity: 0.85 + Math.random() * 0.15,
        fadeSpeed: 0.018 + Math.random() * 0.016,
        size: 1.4 + Math.random() * 1.2,
        trailColor,
        headColor,
        age: 0,
        maxAge: 45 + Math.random() * 30, // frames alive
      };
    }

    let lastTime = performance.now();

    function render(currentTime: number) {
      const deltaMs = Math.min(currentTime - lastTime, 100);
      lastTime = currentTime;
      const deltaFactor = deltaMs / 16.667; // Normalize to 60fps

      if (!ctx) return;

      // 1. Clear background and paint deep space void
      ctx.clearRect(0, 0, width, height);

      // Deep space atmospheric base
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#05060a");
      bgGrad.addColorStop(0.5, "#070913");
      bgGrad.addColorStop(1, "#030408");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle cosmic nebulae (soft drifting interstellar clouds)
      const nebula1X = width * 0.75 + Math.cos(currentTime * 0.0001) * 30;
      const nebula1Y = height * 0.25 + Math.sin(currentTime * 0.0001) * 20;
      const neb1 = ctx.createRadialGradient(nebula1X, nebula1Y, 10, nebula1X, nebula1Y, width * 0.55);
      neb1.addColorStop(0, "rgba(56, 42, 100, 0.09)");
      neb1.addColorStop(0.5, "rgba(25, 35, 75, 0.04)");
      neb1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const nebula2X = width * 0.2 + Math.sin(currentTime * 0.00008) * 40;
      const nebula2Y = height * 0.8 + Math.cos(currentTime * 0.00008) * 25;
      const neb2 = ctx.createRadialGradient(nebula2X, nebula2Y, 10, nebula2X, nebula2Y, width * 0.5);
      neb2.addColorStop(0, "rgba(18, 55, 80, 0.07)");
      neb2.addColorStop(0.6, "rgba(12, 30, 50, 0.03)");
      neb2.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      // 3. Render stars with parallax orbital drift
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Layer-dependent orbital speed (creates real satellite motion parallax)
        const layerMultiplier = star.layer === 0 ? 0.6 : star.layer === 1 ? 1.0 : 1.7;
        const moveDist = baseOrbitalSpeed * layerMultiplier * deltaFactor;

        star.x += dirX * moveDist;
        star.y += dirY * moveDist;

        // Wrap around seamlessly when drifting off boundaries
        const margin = 20;
        if (star.x > width + margin) {
          star.x = -margin;
          star.y = Math.random() * height;
        } else if (star.x < -margin) {
          star.x = width + margin;
          star.y = Math.random() * height;
        }

        if (star.y > height + margin) {
          star.y = -margin;
          star.x = Math.random() * width;
        } else if (star.y < -margin) {
          star.y = height + margin;
          star.x = Math.random() * width;
        }

        // Twinkle calculation
        star.twinklePhase += star.twinkleSpeed * deltaFactor;
        const twinkle = (Math.sin(star.twinklePhase) + 1) * 0.5; // 0 to 1
        const currentAlpha = Math.max(0.18, Math.min(1, star.baseAlpha * (0.68 + twinkle * 0.4)));

        // Draw star
        ctx.fillStyle = `${star.color}${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Extra halo for near bright stars
        if (star.layer === 2 && currentAlpha > 0.65) {
          ctx.fillStyle = `${star.color}${(currentAlpha * 0.2).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Distant satellite orbiting with blinking beacon
      if (satellite.active) {
        satellite.x += satellite.vx * deltaFactor;
        satellite.y += satellite.vy * deltaFactor;
        satellite.blinkPhase += satellite.blinkSpeed * deltaFactor;

        // Render satellite body
        ctx.fillStyle = "rgba(220, 235, 255, 0.75)";
        ctx.beginPath();
        ctx.arc(satellite.x, satellite.y, satellite.size, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing navigation beacon (tiny red/green/white beacon blink)
        const beaconIntensity = Math.pow(Math.sin(satellite.blinkPhase), 6);
        if (beaconIntensity > 0.4) {
          ctx.fillStyle = `rgba(100, 220, 255, ${(beaconIntensity * 0.9).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(satellite.x, satellite.y, satellite.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (satellite.x > width + 50 || satellite.y > height + 50) {
          satellite.active = false;
          nextSatelliteSpawn = currentTime + 22000 + Math.random() * 25000;
        }
      } else if (currentTime > nextSatelliteSpawn) {
        satellite = {
          x: -30,
          y: Math.random() * (height * 0.6) + 30,
          vx: 0.3 + Math.random() * 0.2,
          vy: 0.05 + Math.random() * 0.1,
          size: 1.2 + Math.random() * 0.6,
          blinkPhase: 0,
          blinkSpeed: 0.06 + Math.random() * 0.04,
          active: true,
        };
      }

      // 5. Periodic Shooting Stars / Falling Stars
      if (currentTime > nextShootingStarTime) {
        shootingStars.push(createShootingStar());
        // Next shooting star in 3.5 to 7.5 seconds
        nextShootingStarTime = currentTime + 3500 + Math.random() * 4000;
      }

      // Render active shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.age += deltaFactor;
        ss.x += ss.dx * deltaFactor;
        ss.y += ss.dy * deltaFactor;

        // Fade in rapidly, then fade out smoothly
        const lifeRatio = ss.age / ss.maxAge;
        if (lifeRatio < 0.25) {
          ss.opacity = (lifeRatio / 0.25) * ss.maxOpacity;
        } else {
          ss.opacity = (1 - (lifeRatio - 0.25) / 0.75) * ss.maxOpacity;
        }

        if (lifeRatio >= 1 || ss.opacity <= 0.01 || ss.x > width + 100 || ss.y > height + 100) {
          shootingStars.splice(i, 1);
          continue;
        }

        // Calculate tail start position
        const tailX = ss.x - Math.cos(ss.angle) * ss.length;
        const tailY = ss.y - Math.sin(ss.angle) * ss.length;

        // Gradient for the falling star tail
        const gradient = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        gradient.addColorStop(0, `rgba(${ss.trailColor}, 0)`);
        gradient.addColorStop(0.65, `rgba(${ss.trailColor}, ${(ss.opacity * 0.35).toFixed(3)})`);
        gradient.addColorStop(0.92, `rgba(${ss.trailColor}, ${(ss.opacity * 0.85).toFixed(3)})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${(ss.opacity).toFixed(3)})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = ss.size;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.stroke();

        // Glowing head of the falling star
        ctx.fillStyle = ss.headColor;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, ss.size * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Outer flare around head
        const flare = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, ss.size * 4);
        flare.addColorStop(0, `rgba(255, 255, 255, ${(ss.opacity * 0.9).toFixed(2)})`);
        flare.addColorStop(0.4, `rgba(${ss.trailColor}, ${(ss.opacity * 0.4).toFixed(2)})`);
        flare.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = flare;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, ss.size * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    }

    // Handle visibility changes to preserve resources when tab is hidden
    function handleVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
      } else {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    resize();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="space-star-background"
      aria-hidden="true"
    />
  );
}
